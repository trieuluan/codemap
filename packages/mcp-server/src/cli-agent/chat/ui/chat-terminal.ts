import type { NineRouterProvider } from "../../provider.js";
import type { ModelProfile, TokenUsage } from "../../types.js";
import type { CodeMapMcpToolClient } from "../mcp/mcp-tool-client.js";
import { fetchResourceContext } from "../mcp/mcp-tool-client.js";
import { getCachedContext } from "../../convention-synthesizer.js";
import {
  type ConfirmEditFn,
  isUserRejectedError,
} from "../agent/agent-loop.js";
import {
  runMultiPhaseAgentRuntime,
  runSingleAgentRuntime,
  type ChatUiMode,
} from "../runtime/cli-runtime.js";
import {
  resetHarnessSingleton,
  getMastraThreadId,
  getMastraCurrentModelId,
  getMastraThreadTokenUsage,
  switchMastraThread,
} from "../runtime/mastra-harness-runtime.js";
import { resolveGatewayModel } from "../runtime/mastra-models.js";
import { hydrateMentionContext } from "../agent/mention-context.js";
import {
  classifyTask,
  type TaskClassification,
} from "../agent/task-classifier.js";
import { executeCommand } from "../commands/index.js";
import { isStrongModel } from "../commands/profiles.js";
import { tryGetCurrentWorkspaceInfo } from "../../../lib/workspace-git.js";
import { warmupFileSearch } from "../file-search.js";
import { loadOrSynthesizeAll } from "../../convention-synthesizer.js";
import { createDebugLogger, type DebugLogger } from "../debug-logger.js";
import { EventBus } from "./event-bus.js";
import { Store, createInitialState, type Message } from "./store.js";
import { loadThreadIntoUI } from "../commands/sessions.js";

// Re-export for backward compat with commands/index.ts
export type { Message as ChatEntry } from "./store.js";


const TOOL_CALL_SUMMARY_SUFFIX = " — click preview · Ctrl+O full view";
const TOOL_PREVIEW_LINE_LIMIT = 120;

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function previewToolContent(
  text: string,
  lineLimit = TOOL_PREVIEW_LINE_LIMIT,
): { content: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= lineLimit) return { content: text, truncated: false };
  return {
    content: `${lines.slice(0, lineLimit).join("\n")}\n… (${lines.length - lineLimit} more lines hidden; Ctrl+O for full output)`,
    truncated: true,
  };
}

function normalizeToolDisplayName(toolName: string): string {
  return toolName.includes("__")
    ? toolName.slice(toolName.indexOf("__") + 2)
    : toolName;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringField(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function summarizeToolArgs(toolName: string, args: string): string {
  const displayName = normalizeToolDisplayName(toolName);
  const parsed = parseJsonObject(args);
  if (!parsed) return `Call ${displayName}`;

  const direct = stringField(parsed, [
    "activeForm",
    "content",
    "path",
    "query",
    "q",
    "url",
    "command",
    "id",
  ]);
  if (direct) return direct;

  const patterns = parsed.pattern;
  if (Array.isArray(patterns) && patterns.length > 0) {
    return patterns.map(String).join(", ");
  }

  return `Call ${displayName}`;
}

function summarizeToolResult(resultText: string): string {
  const errorPrefix = "[ERROR] ";
  const isError = resultText.startsWith(errorPrefix);
  const body = isError ? resultText.slice(errorPrefix.length) : resultText;
  const parsed = parseJsonObject(body);
  if (!parsed) return resultText;

  const content = stringField(parsed, ["content", "message", "summary"]);
  if (!content) return resultText;

  return isError ? `${errorPrefix}${content}` : content;
}

function isToolCallSummary(msg: Message | undefined): boolean {
  return Boolean(
    msg?.role === "tool" && msg.content.includes(TOOL_CALL_SUMMARY_SUFFIX),
  );
}

function withToolCallSummary(
  messages: Message[],
  toolName: string,
  args: string,
): Message[] {
  const displayName = normalizeToolDisplayName(toolName);
  const next = [...messages];

  // Look backward through tool_call messages for an existing call from the same server
  // in the current turn. Stop at user/assistant/system messages (turn boundaries).
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const msg = next[i];
    if (!msg) continue;
    if (msg.role === "user") break;
    if (msg.role === "tool_call" && msg.name === displayName) {
      // Tool call already exists, just return
      return next;
    }
    // If we hit a tool result, that means we're in the old summary mode
    if (msg.role === "tool" && isToolCallSummary(msg)) {
      // Convert to interleaved mode: add tool_call before the summary
      const childLine = summarizeToolArgs(toolName, args);
      const toolCallMsg: Message = {
        role: "tool_call",
        name: displayName,
        content: childLine,
        timestamp: Date.now(),
      };
      next.splice(i, 0, toolCallMsg);
      return next;
    }
  }

  // No tool_call for this server in current turn — create one.
  const childLine = summarizeToolArgs(toolName, args);
  const toolCallMsg: Message = {
    role: "tool_call",
    name: displayName,
    content: childLine,
    timestamp: Date.now(),
  };
  next.push(toolCallMsg);
  return next;
}

/** Mark the most-recent pending ⎿ line for toolName as done (✓ or ✗). */
function markToolDone(
  messages: Message[],
  toolName: string,
  resultText: string,
): Message[] {
  const success = !resultText.includes("[ERROR]");
  const marker = success ? " ✓" : " ✗";
  const displayName = normalizeToolDisplayName(toolName);
  const summarizedResult = summarizeToolResult(resultText);
  const preview = previewToolContent(summarizedResult);
  const next = [...messages];

  // Find the tool_call message for this tool (interleaved mode)
  let toolCallIndex = -1;
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const msg = next[i];
    if (!msg) continue;
    if (msg.role === "user") break;
    if (msg.role === "tool_call" && msg.name === displayName) {
      toolCallIndex = i;
      break;
    }
  }

  if (toolCallIndex >= 0) {
    // Insert tool result right after tool_call
    // For now, just add a simple tool message without fullContent
    // (fullContent is only used in the old summary mode)
    const toolResultMsg: Message = {
      role: "tool",
      name: displayName,
      content: preview.content,
      timestamp: Date.now(),
    };
    next.splice(toolCallIndex + 1, 0, toolResultMsg);
    return next;
  }

  // Fallback: look for tool call summary (old mode)
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const msg = next[i];
    if (!msg) continue;
    if (msg.role === "user") break;
    if (msg.role !== "tool") continue;

    if (isToolCallSummary(msg)) {
      const lines = msg.content.split("\n");
      for (let j = lines.length - 1; j >= 0; j -= 1) {
        const line = lines[j];
        if (
          line?.startsWith(`⎿ ${displayName}`) &&
          !line.endsWith("✓") &&
          !line.endsWith("✗")
        ) {
          lines[j] = `${line}${marker}`;
          const toolResults = [
            ...(msg.toolResults ?? []),
            {
              name: displayName,
              content: preview.content,
              fullContent: resultText,
              success,
              truncated: preview.truncated,
              previewLineLimit: TOOL_PREVIEW_LINE_LIMIT,
              originalBytes: byteLength(resultText),
            },
          ];
          next[i] = { ...msg, content: lines.join("\n"), toolResults };
          return next;
        }
      }
      return next;
    }
  }
  return next;
}

function appendToLastToolCallSummary(
  messages: Message[],
  content: string,
): Message[] {
  const next = [...messages];

  // Look backward for a tool_call message (interleaved mode)
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const msg = next[i];
    if (!msg) continue;
    if (msg.role === "user") break;
    if (msg.role === "tool_call") {
      // For tool_call, we don't append content - it's just a marker
      // Instead, we could add metadata, but for now just return
      return next;
    }
    if (msg.role !== "tool") continue;
    if (isToolCallSummary(msg)) {
      next[i] = { ...msg, content: `${msg.content}\n${content}` };
      return next;
    }
  }
  return next;
}

function createAbortError(): Error {
  const err = new Error("Task canceled.");
  err.name = "AbortError";
  return err;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function extractCloudCommitFromGetProject(result: unknown): string | undefined {
  const structured = (result as { structuredContent?: unknown })
    ?.structuredContent;
  if (!structured || typeof structured !== "object") return undefined;

  const data = structured as {
    data?: {
      projectContext?: { latestImport?: { commitSha?: unknown } | null };
      health?: { latestImport?: { commitSha?: unknown } | null };
    };
    projectContext?: { latestImport?: { commitSha?: unknown } | null };
    health?: { latestImport?: { commitSha?: unknown } | null };
  };

  const commitSha =
    data.data?.projectContext?.latestImport?.commitSha ??
    data.data?.health?.latestImport?.commitSha ??
    data.projectContext?.latestImport?.commitSha ??
    data.health?.latestImport?.commitSha;

  return typeof commitSha === "string" && commitSha.trim()
    ? commitSha.trim()
    : undefined;
}

function buildEnrichedContent(
  content: string,
  resourceContext: string | null,
  projectContext: {
    conventions: string | null;
    rules: string | null;
    skills: string | null;
  } | null,
  modelId?: string,
): string {
  const parts: string[] = [];
  if (modelId)
    parts.push(`## Session Info\n\nYou are running as model: **${modelId}**`);
  if (projectContext?.rules) parts.push(projectContext.rules);
  if (projectContext?.conventions) parts.push(projectContext.conventions);
  if (projectContext?.skills) parts.push(projectContext.skills);
  if (resourceContext) parts.push(resourceContext);
  parts.push(
    `## Current Task\n\n<task>\n${content}\n</task>\n\nWork only on this task. When calling recommend_agent_workflow or explore_task, use the task above as the description.`,
  );
  return parts.join("\n\n---\n\n");
}

async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw createAbortError();
  let cleanup: (() => void) | undefined;
  const abortPromise = new Promise<T>((_, reject) => {
    const onAbort = () => reject(createAbortError());
    cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([
    promise.then(
      (value) => {
        cleanup?.();
        return value;
      },
      (err) => {
        cleanup?.();
        throw err;
      },
    ),
    abortPromise,
  ]);
}

interface ChatTerminalOptions {
  provider: NineRouterProvider;
  model: string;
  toolClient: CodeMapMcpToolClient;
  profileId: string;
  profiles?: ModelProfile[];
  availableModels?: string[];
  apiToken?: string; // from McpServerConfig — used to detect unauthenticated state
  mcpConfig?: import("../../../config.js").McpServerConfig;
  uiMode?: ChatUiMode;
}

export class ChatTerminal {
  // Public so App and InputArea can access
  readonly bus: EventBus;
  readonly store: Store;

  private _confirmResolve: ((accept: boolean) => void) | null = null;
  private _planReviewResolve: ((action: string) => void) | null = null;
  private _taskAbort: AbortController | null = null;
  private _taskSeq = 0;
  private _activeTaskId = 0;
  private logger: DebugLogger | null = null;
  private options: ChatTerminalOptions;
  // Session-level caches — fetched once on first turn, reused for the entire session.
  private _resourceContext: string | null | undefined = undefined; // undefined = not yet fetched
  private _projectContext:
    | {
        conventions: string | null;
        rules: string | null;
        skills: string | null;
      }
    | undefined = undefined;

  constructor(options: ChatTerminalOptions) {
    this.options = options;
    this.bus = new EventBus();

    const debug = process.env.CODEMAP_DEBUG_AGENT_TOOLS === "1";
    this.store = new Store(
      createInitialState({
        model: options.model,
        profile: options.profileId,
        availableModels: options.availableModels,
        debug,
      }),
      this.bus,
    );

    if (debug) this.logger = createDebugLogger();
  }

  private async refreshWorkspaceCommits(): Promise<void> {
    try {
      const info = await tryGetCurrentWorkspaceInfo();
      if (info) {
        const current = this.store.getState().workspace;
        this.store.dispatch({
          workspace: {
            repoName: info.repoName,
            branch: info.branch,
            localCommit: info.commitSha,
            cloudCommit: current?.cloudCommit,
          },
        });
      }
    } catch {
      // Non-blocking: workspaces without git should still start normally.
    }

    try {
      const result = await this.options.toolClient.callTool("get_project", {
        verbose: false,
      });
      const cloudCommit = extractCloudCommitFromGetProject(result);
      if (!cloudCommit) return;

      const current = this.store.getState().workspace;
      if (!current) return;

      this.store.dispatch({
        workspace: {
          repoName: current.repoName,
          branch: current.branch,
          localCommit: current.localCommit,
          cloudCommit,
        },
      });
    } catch {
      // Non-blocking: unauthenticated/unlinked/offline workspaces should still start normally.
    }
  }

  // ─── Public API for components ───────────────────────────

  /** Cancel the running task and reset to idle. Late async results are ignored by task id. */
  cancelTask(): string | null {
    const state = this.store.getState();
    if (!state.input.busy) return null;
    const canceledPrompt = state.input.lastUserText;
    this._taskAbort?.abort();
    this._taskAbort = null;
    this._activeTaskId = 0;
    // Also cancel any pending confirm dialog
    this._confirmResolve?.(false);
    this._confirmResolve = null;
    this._planReviewResolve?.("cancel");
    this._planReviewResolve = null;

    // Roll back UI messages to before the last user message so the conversation
    // history is preserved and the user's prompt is returned to the input field.
    const msgs = state.messages as Message[];
    const lastUserIdx = msgs.reduce(
      (acc, m, i) => (m.role === "user" ? i : acc),
      -1,
    );
    const rolledBackMsgs = lastUserIdx >= 0 ? msgs.slice(0, lastUserIdx) : msgs;

    this.store.dispatch({
      messages: rolledBackMsgs,
      input: { ...state.input, busy: false },
      task: { phase: "idle", toolsCalled: 0 },
      confirm: { active: false, toolName: "", preview: null },
      planReview: { active: false, selection: 0 },
      streaming: { active: false, content: "", entryIndex: -1 },
    });
    return canceledPrompt;
  }

  resolveConfirm(accept: boolean): void {
    this._confirmResolve?.(accept);
    this._confirmResolve = null;
    this.store.dispatch({
      confirm: { active: false, toolName: "", preview: null },
    });
  }

  /** Called by the multi-phase loop: pause and wait for user plan review. */
  waitForPlanReview(): Promise<string> {
    return new Promise((resolve) => {
      this._planReviewResolve = resolve;
      this.store.dispatch({ planReview: { active: true, selection: 0 } });
      this.bus.scheduleRefresh();
    });
  }

  /** Called by the UI when user makes a plan review decision. */
  resolvePlanReview(action: string): void {
    this._planReviewResolve?.(action);
    this._planReviewResolve = null;
    this.store.dispatch({ planReview: { active: false, selection: 0 } });
    this.bus.scheduleRefresh();
  }

  resolveConfirmAll(): void {
    this.store.dispatch((prev) => ({
      input: { ...prev.input, autoAccept: true },
    }));
    this.resolveConfirm(true);
  }

  // ─── Start ───────────────────────────────────────────────

  async start(): Promise<void> {
    // Show login screen if not authenticated
    if (!this.options.apiToken && this.options.mcpConfig) {
      const { showLoginScreen } = await import("./pi-tui/login-screen.js");
      const result = await showLoginScreen(this.options.mcpConfig);
      if (result === "exit") return;
      // "loggedin" or "skip" → proceed to main chat
    }

    // Warm up file search index in the background so startup can render quickly.
    warmupFileSearch()
      .catch(() => {})
      .finally(() => this.bus.scheduleRefresh());

    // Git workspace info + cloud import commit + session init
    await this.refreshWorkspaceCommits();

    // Synthesize project conventions in background (non-blocking)
    const profiles = this.options.profiles ?? [];
    const plannerModel =
      profiles.find((p) => p.id === "planner")?.model ??
      profiles.find((p) => p.id === "coder")?.model ??
      this.store.getState().config.model;
    this.store.dispatch({ synthRunning: true });
    this.bus.scheduleRefresh();
    loadOrSynthesizeAll(this.options.provider, plannerModel)
      .catch(() => {})
      .finally(() => {
        this.store.dispatch({ synthRunning: false });
        this.bus.scheduleRefresh();
      });

    const { startPiTuiApp } = await import("./pi-tui-app.js");
    await startPiTuiApp(this);
  }

  // ─── Session management ───────────────────────────────────

  persistSession(): void {
    /* no-op: Mastra persists thread storage */
  }

  startNewSession(): void {
    this.store.dispatch((prev) => ({
      messages: [],
      sessionTokens: 0,
      input: { ...prev.input, history: [] },
    }));
    resetHarnessSingleton().catch(() => {
      /* best-effort */
    });
  }

  async loadThreadById(threadId: string): Promise<void> {
    try {
      await switchMastraThread(threadId);
      await loadThreadIntoUI(
        threadId,
        (msgs) => this.store.dispatch({ messages: msgs }),
        (msg) => this.appendMessage(msg as Message),
      );
      this.store.dispatch({
        sessionTokens: 0,
      });
    } catch (err) {
      this.appendMessage({
        role: "system",
        content: `Failed to load thread: ${err}`,
      });
    }
  }

  // ─── Submit ──────────────────────────────────────────────

  async handleSubmit(text: string): Promise<void> {
    await this.handleSubmitWithContent(text, text);
  }

  async handleSubmitWithContent(
    displayText: string,
    contentText: string,
    forceMultiPhase = false,
  ): Promise<void> {
    const state = this.store.getState();
    if (state.input.busy) return;

    // /plan — toggle plan mode on/off (like Claude Code's /plan)
    // /plan <message> — force multi-phase for this single message (prefix shortcut)
    if (/^\/plan(\s|$)/i.test(displayText)) {
      const taskText = displayText.replace(/^\/plan\s*/i, "").trim();
      if (taskText) {
        // Has message → force multi-phase for this message only
        await this.handleSubmitWithContent(taskText, taskText, true);
      } else {
        // No message → toggle plan mode
        const current = this.store.getState().planMode;
        this.store.dispatch({ planMode: !current });
        this.appendMessage({
          role: "system",
          content: !current
            ? "Plan mode ON — all messages will go through planner → coder → reviewer.\nType /plan again to exit."
            : "Plan mode OFF — back to normal routing.",
        });
      }
      return;
    }

    // Command dispatch
    if (displayText.startsWith("/")) {
      if (displayText === "/help") {
        this.store.dispatch({ screen: "help" });
        return;
      }
      const handled = executeCommand(displayText, this.buildCommandContext());
      if (!handled) {
        this.appendMessage({
          role: "system",
          content: "Unknown command. Type /help for available commands.",
        });
      }
      return;
    }

    if (displayText.startsWith("!")) {
      await this.handleShellSubmit(displayText);
      return;
    }

    this.store.dispatch({
      input: { ...state.input, busy: true, lastUserText: contentText },
    });
    this.appendMessage({ role: "user", content: displayText });
    this.store.dispatch({
      task: {
        phase: "thinking",
        startTime: Date.now(),
        toolsCalled: 0,
        model: this.store.getState().config.model,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    });
    const taskAbort = new AbortController();
    const taskId = this.beginTask(taskAbort);

    let streamingContent = "";
    let hasStreamingEntry = false;

    const resetStreaming = () => {
      streamingContent = "";
      hasStreamingEntry = false;
      this.store.dispatch({
        streaming: { active: false, content: "", entryIndex: -1 },
      });
    };

    const sharedCallbacks = {
      onStreamReset: () => {
        if (!this.isActiveTask(taskId, taskAbort)) return;
        streamingContent = "";
        this.store.dispatch({
          streaming: { active: false, content: "", entryIndex: -1 },
        });
        this.bus.scheduleRefresh();
      },
      onToken: (token: string) => {
        if (!this.isActiveTask(taskId, taskAbort)) return;
        const s = this.store.getState();
        if (!s.task || s.task.phase === "idle") return;
        streamingContent += token;
        if (!hasStreamingEntry) {
          hasStreamingEntry = true;
          const entryIndex = this.appendMessage({
            role: "assistant",
            content: streamingContent,
          });
          this.store.dispatch({
            streaming: { active: true, content: streamingContent, entryIndex },
          });
        } else {
          this.updateLastAssistantMessage(streamingContent);
          this.store.dispatch((prev) => ({
            streaming: {
              ...prev.streaming,
              active: true,
              content: streamingContent,
            },
          }));
        }
        this.store.dispatch({ task: { ...s.task, phase: "streaming" } });
        this.bus.scheduleRefresh();
      },
      onModel: (model: string) => {
        if (!this.isActiveTask(taskId, taskAbort)) return;
        this.store.dispatch({ task: { ...this.store.getState().task, model } });
      },
      onUsage: (usage: TokenUsage) => {
        if (!this.isActiveTask(taskId, taskAbort)) return;
        this.store.dispatch((prev) => ({ task: { ...prev.task, usage } }));
      },
      onToolStart: (name: string, args: string, id: string) => {
        if (!this.isActiveTask(taskId, taskAbort)) return;
        this.logger?.logToolStart(name, args, id);
        // Soft reset: clear buffered text but keep hasStreamingEntry=true so the
        // next text response from Mastra replaces this entry instead of appending.
        streamingContent = "";
        this.store.dispatch({
          streaming: { active: false, content: "", entryIndex: -1 },
        });
        const s = this.store.getState();
        this.store.dispatch({
          task: {
            ...s.task,
            phase: "tool",
            toolName: name,
            toolArgs: args,
            toolsCalled: s.task.toolsCalled + 1,
          },
        });
        this.store.dispatch((prev) => ({
          messages: withToolCallSummary(prev.messages, name, args),
        }));
        this.bus.scheduleRefresh();
      },
      onToolResult: (name: string, resultText: string) => {
        if (!this.isActiveTask(taskId, taskAbort)) return;
        this.logger?.logToolResult(name, resultText);
        resetStreaming();
        this.store.dispatch({
          task: {
            ...this.store.getState().task,
            phase: "executing",
            toolName: undefined,
            toolArgs: undefined,
          },
        });
        this.store.dispatch((prev) => ({
          messages: markToolDone(prev.messages, name, resultText),
        }));
        this.bus.scheduleRefresh();
      },
      onOMObservation: (tokensObserved: number, observationTokens: number) => {
        if (!this.isActiveTask(taskId, taskAbort)) return;
        this.appendMessage({
          role: "system",
          content: `🧠 Memory: observed ${tokensObserved.toLocaleString()} tokens → distilled to ${observationTokens.toLocaleString()} observation tokens`,
        });
        this.bus.scheduleRefresh();
      },
      onOMReflection: (compressedTokens: number) => {
        if (!this.isActiveTask(taskId, taskAbort)) return;
        this.appendMessage({
          role: "system",
          content: `🧠 Memory: reflected & compressed ${compressedTokens.toLocaleString()} tokens`,
        });
        this.bus.scheduleRefresh();
      },
      onDebug: (info: Record<string, unknown>) => {
        if (!this.isActiveTask(taskId, taskAbort)) return;
        if (!this.store.getState().debug) return;
        if (info.event === "stream_request") {
          this.logger?.logStreamRequest({
            model: String(info.model ?? ""),
            messageCount: Number(info.messageCount ?? 0),
            toolCount: Number(info.toolCount ?? 0),
            hasSystem: Boolean(info.hasSystem),
            toolsCalled: this.store.getState().task.toolsCalled,
          });
        } else if (info.event === "tool_fallback") {
          this.logger?.logToolFallback(String(info.reason ?? ""));
        } else {
          this.logger?.logDebugInfo(info);
        }
      },
    };

    try {
      const mentionContext = await hydrateMentionContext(contentText);
      if (!this.isActiveTask(taskId, taskAbort)) return;
      for (const warning of mentionContext.warnings) {
        this.appendMessage({ role: "system", content: `⚠ ${warning}` });
      }

      const profiles = this.options.profiles ?? [];
      const plannerProfile = profiles.find((p) => p.id === "planner");
      const coderProfile = profiles.find((p) => p.id === "coder");
      const reviewerProfile = profiles.find((p) => p.id === "reviewer");
      const hasAllProfiles = !!(
        plannerProfile &&
        coderProfile &&
        reviewerProfile
      );
      let classification: TaskClassification = {
        phase: "single",
        tier: "coder",
        taskType: "general",
        reason: "",
      };

      const planMode = this.store.getState().planMode;

      if (!forceMultiPhase && !planMode && hasAllProfiles) {
        this.store.dispatch({
          task: {
            ...this.store.getState().task,
            phase: "classifying",
            model: plannerProfile.model,
          },
        });
        this.bus.scheduleRefresh();

        classification = await classifyTask(
          contentText,
          this.options.provider,
          coderProfile.model, // coder has better instruction following for JSON classification
          taskAbort.signal,
        );
        if (!this.isActiveTask(taskId, taskAbort)) return;
      }

      const useMultiPhase =
        forceMultiPhase ||
        planMode ||
        (hasAllProfiles && classification.phase === "multi");
      const singlePhaseModel =
        (() => {
          if (classification.tier === "planner") return plannerProfile?.model;
          if (classification.tier === "reviewer") return reviewerProfile?.model;
          return coderProfile?.model;
        })() ?? this.store.getState().config.model;

      // Fetch session-level caches once — reused across all agent calls this turn.
      const [sessionResourceCtx, sessionProjectCtx] = await Promise.all([
        this.getSessionResourceContext(taskAbort.signal),
        this.getSessionProjectContext(),
      ]);

      const result = useMultiPhase
        ? await runMultiPhaseAgentRuntime({
            provider: this.options.provider,
            availableModels: this.store.getState().config.availableModels,
            coderModel: coderProfile!.model,
            reviewerModel: reviewerProfile!.model,
            userMessage: {
              role: "user",
              content: buildEnrichedContent(
                mentionContext.content,
                sessionResourceCtx,
                sessionProjectCtx,
                getMastraCurrentModelId() ??
                  resolveGatewayModel(
                    coderProfile!.model,
                    this.store.getState().config.availableModels,
                  ),
              ),
            },
            toolClient: this.options.toolClient,
            signal: taskAbort.signal,
            confirmEdit: this.makeConfirmEdit(),
            onPhaseStart: (phase, model) => {
              if (!this.isActiveTask(taskId, taskAbort)) return;
              resetStreaming();
              this.store.dispatch({
                task: { ...this.store.getState().task, phase, model },
              });
              this.bus.scheduleRefresh();
            },
            onPlanReady: (plan) => {
              if (!this.isActiveTask(taskId, taskAbort)) return;
              // Remove the streaming assistant message — it contains the same plan content
              // streamed via onToken. Keeping it would show the plan twice (once as an
              // assistant message without prefix, once as "plan: ..." below).
              if (hasStreamingEntry) {
                this.store.dispatch((prev) => ({
                  messages: prev.messages.filter(
                    (m) =>
                      m.role !== "assistant" || m.content !== streamingContent,
                  ),
                }));
              }
              resetStreaming();
              this.appendMessage({
                role: "tool",
                content: plan,
                toolName: "plan",
              });
              this.bus.scheduleRefresh();
            },
            onPlanWait: () => this.waitForPlanReview(),
            ...sharedCallbacks,
          })
        : await runSingleAgentRuntime({
            provider: this.options.provider,
            model: singlePhaseModel,
            availableModels: this.store.getState().config.availableModels,
            userMessage: {
              role: "user",
              content: buildEnrichedContent(
                mentionContext.content,
                sessionResourceCtx,
                sessionProjectCtx,
                getMastraCurrentModelId() ??
                  resolveGatewayModel(
                    singlePhaseModel,
                    this.store.getState().config.availableModels,
                  ),
              ),
            },
            toolClient: this.options.toolClient,
            signal: taskAbort.signal,
            confirmEdit: this.makeConfirmEdit(),
            ...sharedCallbacks,
          });

      if (!this.isActiveTask(taskId, taskAbort)) return;
      const s = this.store.getState();
      this.store.dispatch({
        task: { ...s.task, phase: "done", endTime: Date.now() },
      });

      // Auto-exit plan mode after one multi-phase run.
      if (useMultiPhase && planMode && !forceMultiPhase) {
        this.store.dispatch({ planMode: false });
      }

      if (this.logger) {
        const toolCallsList = result.messages
          .filter((m) => m.role === "assistant" && m.toolCalls)
          .flatMap((m) => m.toolCalls ?? [])
          .map((tc) => tc.function.name);
        this.logger.logSummary({
          totalChunks: 0,
          textChunks: 0,
          toolCallChunks: toolCallsList.length,
          finalToolCalls: toolCallsList,
          model: this.store.getState().config.model,
        });
      }

      if (result.unsupportedToolCalling) {
        const cs = this.store.getState().config;
        this.appendMessage({
          role: "system",
          content: `⚠ Model "${cs.model}" does not support tool calling — the coder generated text instead of using tools.\nCheck your coder profile in config and switch to a tool-capable model.`,
        });
      }

      if (
        useMultiPhase &&
        !result.usedTools &&
        !result.unsupportedToolCalling
      ) {
        this.appendMessage({
          role: "system",
          content: `⚠ Execute phase completed without any tool calls — the model may not be routing to a tool-capable backend.\nCheck your coder profile configuration or start a new session with /new.`,
        });
      }

      if (hasStreamingEntry && result.text) {
        this.updateLastAssistantMessage(result.text || "(no response)");
      } else if (!hasStreamingEntry) {
        this.appendMessage({
          role: "assistant",
          content: result.text || "(no response)",
        });
      }

      resetStreaming();

      this.bus.scheduleRefresh();

      // Accumulate session-level token usage from this turn's result.
      if (result.usage?.totalTokens) {
        this.store.dispatch((prev) => ({
          sessionTokens: prev.sessionTokens + result.usage!.totalTokens,
        }));
        this.bus.scheduleRefresh();
      } else {
        // Fallback: try to sync from Mastra thread storage.
        getMastraThreadTokenUsage().then((usage) => {
          if (usage?.totalTokens) {
            this.store.dispatch({ sessionTokens: usage.totalTokens });
            this.bus.scheduleRefresh();
          }
        }).catch(() => {});
      }
    } catch (err) {
      if (isAbortError(err) || taskAbort.signal.aborted) return;
      if (isUserRejectedError(err)) {
        this.store.dispatch({ task: { phase: "idle", toolsCalled: 0 } });
        this.appendMessage({
          role: "system",
          content:
            "Edit rejected — stream stopped. Continue chatting to try a different approach.",
        });
        return;
      }
      this.store.dispatch({ task: { phase: "idle", toolsCalled: 0 } });
      this.logger?.logError(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      const isContextFull =
        errMsg.includes("context window") ||
        errMsg.includes("context length") ||
        errMsg.includes("maximum context") ||
        errMsg.includes("token limit") ||
        errMsg.includes("too long") ||
        errMsg.includes("exceeds") ||
        errMsg.includes("input is too long") ||
        errMsg.includes("prompt is too long");
      const isModelBroken =
        errMsg.includes("zero-length") ||
        errMsg.includes("empty document") ||
        errMsg.includes("429");
      const cs = this.store.getState().config;

      if (isContextFull) {
        this.appendMessage({
          role: "system",
          content:
            "Context window full. Start a new session with /new to free context.",
        });
      } else if (isModelBroken && cs.availableModels.length > 1) {
        const strong = cs.availableModels.filter(
          (m) => m !== cs.model && isStrongModel(m),
        );
        const newModel =
          strong[0] ?? cs.availableModels.find((m) => m !== cs.model) ?? null;
        if (newModel) {
          this.store.dispatch({ config: { ...cs, model: newModel } });
          this.appendMessage({
            role: "system",
            content: `Model "${cs.model}" failed. Auto-switched to "${newModel}". Resend your message to retry.`,
          });
        } else {
          this.appendMessage({
            role: "system",
            content: `Model "${cs.model}" failed and no alternative found.`,
          });
        }
      } else {
        this.appendMessage({ role: "system", content: `Error: ${errMsg}` });
      }
    }

    if (this.isActiveTask(taskId, taskAbort)) {
      this.finishTask(taskId);
    }
  }

  private async handleShellSubmit(text: string): Promise<void> {
    const command = text.slice(1).trim();
    if (!command) {
      this.appendMessage({
        role: "system",
        content: "Usage: !<shell command>",
      });
      return;
    }

    this.store.dispatch((prev) => ({ input: { ...prev.input, busy: true } }));
    this.appendMessage({ role: "user", content: text });
    this.store.dispatch({
      task: {
        phase: "tool",
        startTime: Date.now(),
        toolsCalled: 1,
        toolName: "bash",
        toolArgs: command,
        model: this.store.getState().config.model,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    });
    const taskAbort = new AbortController();
    const taskId = this.beginTask(taskAbort);

    try {
      const result = await abortable(
        this.options.toolClient.callTool("bash", { command }),
        taskAbort.signal,
      );
      if (!this.isActiveTask(taskId, taskAbort)) return;
      const content = result.content || "(no output)";
      this.appendMessage({ role: "tool", content, toolName: "bash result" });
      this.store.dispatch({
        task: {
          ...this.store.getState().task,
          phase: "done",
          endTime: Date.now(),
        },
      });
    } catch (err) {
      if (isAbortError(err) || taskAbort.signal.aborted) return;
      if (isUserRejectedError(err)) {
        this.store.dispatch({ task: { phase: "idle", toolsCalled: 0 } });
        this.appendMessage({
          role: "system",
          content:
            "Edit rejected — stream stopped. Continue chatting to try a different approach.",
        });
        this.persistSession();
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.appendMessage({
        role: "system",
        content: `Shell command failed: ${message}`,
      });
      this.store.dispatch({ task: { phase: "idle", toolsCalled: 0 } });
    } finally {
      if (this.isActiveTask(taskId, taskAbort)) {
        this.finishTask(taskId);
      }
      this.bus.scheduleRefresh();
    }
  }

  // ─── Confirm edit ─────────────────────────────────────────

  private makeConfirmEdit(): ConfirmEditFn {
    return async (name, args, preview) => {
      // Show preview below the ⎿ toolName line in the summary.
      if (preview) {
        this.store.dispatch((prev) => ({
          messages: appendToLastToolCallSummary(
            prev.messages,
            // Don't double-wrap: write-file preview already has a ```diff block inside metadata.
            preview.includes("@@ -") && !preview.includes("```diff")
              ? `\`\`\`diff\n${preview}\n\`\`\``
              : preview,
          ),
        }));
        this.bus.scheduleRefresh();
      }

      if (this.store.getState().input.autoAccept) return true;

      // Manual confirm: wait for user yes/no.
      this.store.dispatch({
        confirm: { active: true, toolName: name, preview },
      });
      const accepted = await new Promise<boolean>((resolve) => {
        this._confirmResolve = resolve;
      });

      if (!accepted) {
        // Mark ✗ immediately — onToolResult won't fire on rejection.
        this.store.dispatch((prev) => ({
          messages: markToolDone(
            prev.messages,
            name,
            "[ERROR] User rejected tool execution.",
          ),
        }));
        this.bus.scheduleRefresh();
      }

      return accepted;
    };
  }

  // ─── Session context cache ────────────────────────────────

  private async getSessionResourceContext(
    signal?: AbortSignal,
  ): Promise<string | null> {
    if (this._resourceContext !== undefined) return this._resourceContext;
    try {
      this._resourceContext = await fetchResourceContext(
        this.options.toolClient,
      );
    } catch {
      this._resourceContext = null;
    }
    return this._resourceContext;
  }

  private async getSessionProjectContext(): Promise<{
    conventions: string | null;
    rules: string | null;
    skills: string | null;
  }> {
    if (this._projectContext !== undefined) return this._projectContext;
    try {
      this._projectContext = await getCachedContext();
    } catch {
      this._projectContext = { conventions: null, rules: null, skills: null };
    }
    return (
      this._projectContext ?? { conventions: null, rules: null, skills: null }
    );
  }

  // ─── Message helpers ──────────────────────────────────────

  private appendMessage(msg: Message): number {
    let index = -1;
    this.store.dispatch((prev) => {
      index = prev.messages.length;
      return {
        messages: [...prev.messages, { timestamp: Date.now(), ...msg }],
      };
    });
    return index;
  }

  private updateLastAssistantMessage(content: string): void {
    this.store.dispatch((prev) => {
      const msgs = [...prev.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]!.role === "assistant" && !msgs[i]!.toolName) {
          msgs[i] = { ...msgs[i]!, content };
          break;
        }
      }
      return { messages: msgs };
    });
  }

  private beginTask(controller: AbortController): number {
    const taskId = ++this._taskSeq;
    this._activeTaskId = taskId;
    this._taskAbort = controller;
    return taskId;
  }

  private finishTask(taskId: number): void {
    if (this._activeTaskId !== taskId) return;
    this._activeTaskId = 0;
    this._taskAbort = null;
    this.store.dispatch((prev) => ({ input: { ...prev.input, busy: false } }));
  }

  private isActiveTask(taskId: number, controller: AbortController): boolean {
    return (
      this._activeTaskId === taskId &&
      this._taskAbort === controller &&
      !controller.signal.aborted
    );
  }

  // ─── Command context ──────────────────────────────────────

  private buildCommandContext() {
    const s = this.store.getState();
    const profiles = this.options.profiles ?? [];
    const reviewerModel =
      profiles.find((p) => p.id === "reviewer")?.model ??
      profiles.find((p) => p.id === "coder")?.model ??
      s.config.model;
    const coderModel =
      profiles.find((p) => p.id === "coder")?.model ?? s.config.model;
    const plannerModel =
      profiles.find((p) => p.id === "planner")?.model ?? s.config.model;
    return {
      currentModel: s.config.model,
      provider: this.options.provider,
      reviewerModel,
      coderModel,
      plannerModel,
      availableModels: s.config.availableModels,
      toolClient: this.options.toolClient,
      getMessages: () => this.store.getState().messages as Message[],
      appendMessage: (
        msg: Partial<Message> & { role: string; content: string },
      ) => {
        this.store.dispatch((prev) => ({
          messages: [
            ...prev.messages,
            { timestamp: Date.now(), ...msg } as Message,
          ],
        }));
        this.bus.scheduleRefresh();
      },
      setMessages: (updater: Message[] | ((prev: Message[]) => Message[])) => {
        if (typeof updater === "function") {
          this.store.dispatch((prev) => ({ messages: updater(prev.messages) }));
        } else {
          this.store.dispatch({ messages: updater });
        }
      },
      setInputHistory: (updater: string[] | ((prev: string[]) => string[])) => {
        if (typeof updater === "function") {
          this.store.dispatch((prev) => ({
            input: { ...prev.input, history: updater(prev.input.history) },
          }));
        } else {
          this.store.dispatch((prev) => ({
            input: { ...prev.input, history: updater },
          }));
        }
      },
      setCurrentModel: (m: string) => {
        this.store.dispatch((prev) => ({
          config: { ...prev.config, model: m },
        }));
      },
      setBusy: (b: boolean) => {
        this.store.dispatch((prev) => ({ input: { ...prev.input, busy: b } }));
      },
      debug: s.debug,
      setDebug: (d: boolean) => {
        this.store.dispatch({ debug: d });
        if (d && !this.logger) this.logger = createDebugLogger();
        if (!d) this.logger = null;
      },
      debugLogFile: this.logger?.logFile ?? null,
      lastUserText: s.input.lastUserText,
      persistSession: () => {
        /* no-op */
      },
      getSessionTokens: () => this.store.getState().sessionTokens,
      resend: () => {
        const cs = this.store.getState();
        if (cs.input.lastUserText && !cs.input.busy)
          this.handleSubmit(cs.input.lastUserText);
      },
      exit: () => {
        process.stdout.write("\x1b[?1000l\x1b[?1006l");
        process.exit(0);
      },
      newSession: () => this.startNewSession(),
      getMastraThreadId: () => getMastraThreadId(),
      loadThreadById: (id: string) => this.loadThreadById(id),
      startSubprocess: (command: string) => {
        this.store.dispatch({
          subprocess: { active: true, command, logLines: [] },
        });
      },
      logSubprocess: (line: string) => {
        this.store.dispatch((prev) => ({
          subprocess: {
            ...prev.subprocess,
            logLines: [...prev.subprocess.logLines, line],
          },
        }));
      },
      endSubprocess: () => {
        this.store.dispatch({
          subprocess: { active: false, command: "", logLines: [] },
        });
      },
      refreshWorkspaceCommits: () => this.refreshWorkspaceCommits(),
    };
  }
}
