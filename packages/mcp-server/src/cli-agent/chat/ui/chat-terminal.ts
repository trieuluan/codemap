import type { NineRouterProvider } from "../../provider.js";
import type { ChatMessage, ModelProfile, TokenUsage } from "../../types.js";
import type { CodeMapMcpToolClient } from "../mcp/mcp-tool-client.js";
import { runAgentLoop, type ConfirmEditFn, isUserRejectedError } from "../agent/agent-loop.js";
import { runMultiPhaseAgentLoop } from "../agent/multi-phase-loop.js";
import { ContextCompactor } from "../agent/context-compactor.js";
import { hydrateMentionContext } from "../agent/mention-context.js";
import { classifyTask, type TaskClassification } from "../agent/task-classifier.js";
import { executeCommand } from "../commands/index.js";
import { isStrongModel } from "../commands/profiles.js";
import { tryGetCurrentWorkspaceInfo } from "../../../lib/workspace-git.js";
import { warmupFileSearch } from "../file-search.js";
import {
  createSession,
  saveSession,
  loadSession,
  findLastSession,
} from "../session-store.js";
import { loadOrSynthesizeAll } from "../../convention-synthesizer.js";
import { createDebugLogger, type DebugLogger } from "../debug-logger.js";
import { EventBus } from "./event-bus.js";
import { Store, createInitialState, type Message } from "./store.js";

// Re-export for backward compat with commands/index.ts
export type { Message as ChatEntry } from "./store.js";

function stripImagesFromContent(text: string): string {
  return text.replace(
    /!\[([^\]]*)\]\(data:image\/[^;]+;base64,[a-zA-Z0-9+/=\s]+\)/g,
    (_match, alt) => `[image${alt ? `: ${alt}` : ""}]`,
  );
}

function subtractUsage(next: TokenUsage, prev: TokenUsage): TokenUsage {
  return {
    promptTokens: Math.max(0, next.promptTokens - prev.promptTokens),
    completionTokens: Math.max(0, next.completionTokens - prev.completionTokens),
    totalTokens: Math.max(0, next.totalTokens - prev.totalTokens),
  };
}

function addUsage(total: TokenUsage, next: TokenUsage): TokenUsage {
  return {
    promptTokens: total.promptTokens + next.promptTokens,
    completionTokens: total.completionTokens + next.completionTokens,
    totalTokens: total.totalTokens + next.totalTokens,
  };
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
  const structured = (result as { structuredContent?: unknown })?.structuredContent;
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

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
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
  private compactor: ContextCompactor;
  private options: ChatTerminalOptions;
  private _sessionId: string | null = null;
  private _gitMeta: { repo: string; branch: string } = { repo: "", branch: "" };

  constructor(options: ChatTerminalOptions) {
    this.options = options;
    this.bus = new EventBus();
    this.compactor = new ContextCompactor(options.provider);

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
        this._gitMeta = { repo: info.repoName ?? "", branch: info.branch ?? "" };
      }
    } catch {
      // Non-blocking: workspaces without git should still start normally.
    }

    try {
      const result = await this.options.toolClient.callTool("get_project", { verbose: false });
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
  cancelTask(): void {
    const state = this.store.getState();
    if (!state.input.busy) return;
    this._taskAbort?.abort();
    this._taskAbort = null;
    this._activeTaskId = 0;
    // Also cancel any pending confirm dialog
    this._confirmResolve?.(false);
    this._confirmResolve = null;
    this.appendMessage({ role: "system", content: this.formatCancelMessage(state.task) });
    this.store.dispatch({
      input: { ...state.input, busy: false },
      task: { phase: "idle", toolsCalled: 0 },
      confirm: { active: false, toolName: "", preview: null },
      streaming: { active: false, content: "", entryIndex: -1 },
    });
  }

  resolveConfirm(accept: boolean): void {
    this._confirmResolve?.(accept);
    this._confirmResolve = null;
    this.store.dispatch({ confirm: { active: false, toolName: "", preview: null } });
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
    this.store.dispatch((prev) => ({ input: { ...prev.input, autoAccept: true } }));
    this.resolveConfirm(true);
  }

  async compactHistory(onProgress?: (step: string) => void): Promise<{
    beforeMessages: number;
    afterMessages: number;
    beforeTokens: number;
    afterTokens: number;
    compacted: boolean;
    summaryText?: string;
  }> {
    const state = this.store.getState();
    const beforeHistory = state.agentHistory as ChatMessage[];
    const beforeTokens = this.compactor.estimateTokens(beforeHistory);
    onProgress?.("Calling summarizer model...");
    const compacted = await this.compactor.compactNow(beforeHistory, state.config.model);
    const nextHistory = compacted ?? beforeHistory;
    const afterTokens = this.compactor.estimateTokens(nextHistory);

    let summaryText: string | undefined;
    if (compacted) {
      const summaryMsg = nextHistory.find(
        (m) => m.role === "system" && m.content.includes("[Previous conversation summary]"),
      );
      summaryText = summaryMsg?.content.replace("[Previous conversation summary]\n", "").trim();

      const cs = this.compactor.getState(nextHistory);
      this.store.dispatch({
        agentHistory: nextHistory,
        compaction: {
          usagePercent: cs.usagePercent,
          compactedCount: cs.compactedCount,
          lastStrategy: cs.lastStrategy,
        },
      });
    }

    return {
      beforeMessages: beforeHistory.length,
      afterMessages: nextHistory.length,
      beforeTokens,
      afterTokens,
      compacted: Boolean(compacted),
      summaryText,
    };
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

    // Warm up file search index so @ mention is instant on first use
    await warmupFileSearch();

    // Git workspace info + cloud import commit + session init
    await this.refreshWorkspaceCommits();

    await this.initSession();

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

  private async initSession(): Promise<void> {
    const { repo, branch } = this._gitMeta;
    const model = this.store.getState().config.model;
    try {
      const last = findLastSession(repo, branch);
      if (last) {
        const loaded = loadSession(last.id);
        if (loaded && loaded.agentHistory.length > 0) {
          this._sessionId = last.id;
          this.store.dispatch({
            agentHistory: loaded.agentHistory,
            messages: [
              ...loaded.uiMessages,
              {
                role: "system",
                content: `_Session resumed · ${loaded.agentHistory.length} messages · ${last.name}_`,
              },
            ],
          });
          return;
        }
      }
    } catch { /* fallback to new session */ }
    this._sessionId = createSession({ gitRepo: repo, gitBranch: branch, model });
  }

  persistSession(): void {
    if (!this._sessionId) return;
    const s = this.store.getState();
    const tokenCount = s.sessionUsage.totalTokens;
    const model = s.task.model ?? s.config.model;
    try {
      saveSession(
        this._sessionId,
        s.agentHistory as ChatMessage[],
        tokenCount,
        model,
        s.messages, // save full visible transcript for exact resume
      );
    } catch { /* non-blocking */ }
  }

  startNewSession(): void {
    const { repo, branch } = this._gitMeta;
    const model = this.store.getState().config.model;
    try {
      this._sessionId = createSession({ gitRepo: repo, gitBranch: branch, model });
    } catch { /* ignore */ }
    this.store.dispatch((prev) => ({
      agentHistory: [],
      messages: [],
      sessionUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      input: { ...prev.input, history: [] },
    }));
  }

  loadSessionById(sessionId: string): void {
    try {
      const loaded = loadSession(sessionId);
      if (!loaded) {
        this.appendMessage({ role: "system", content: "Session not found." });
        return;
      }
      this._sessionId = sessionId;
      this.store.dispatch({
        agentHistory: loaded.agentHistory,
        messages: [
          ...loaded.uiMessages,
          {
            role: "system",
            content: `_Session loaded · ${loaded.agentHistory.length} messages · ${loaded.session.name}_`,
          },
        ],
        sessionUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });
    } catch (err) {
      this.appendMessage({ role: "system", content: `Failed to load session: ${err}` });
    }
  }

  // ─── Submit ──────────────────────────────────────────────

  async handleSubmit(text: string): Promise<void> {
    await this.handleSubmitWithContent(text, text);
  }

  async handleSubmitWithContent(displayText: string, contentText: string, forceMultiPhase = false): Promise<void> {
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
        this.appendMessage({ role: "system", content: "Unknown command. Type /help for available commands." });
      }
      return;
    }

    if (displayText.startsWith("!")) {
      await this.handleShellSubmit(displayText);
      return;
    }

    this.store.dispatch({ input: { ...state.input, busy: true, lastUserText: contentText } });
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
    let lastTurnUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    const resetStreaming = () => { streamingContent = ""; hasStreamingEntry = false; };

    const sharedCallbacks = {
      onToken: (token: string) => {
        if (!this.isActiveTask(taskId, taskAbort)) return;
        const s = this.store.getState();
        if (!s.task || s.task.phase === "idle") return;
        streamingContent += token;
        if (!hasStreamingEntry) {
          hasStreamingEntry = true;
          this.appendMessage({ role: "assistant", content: streamingContent });
        } else {
          this.updateLastAssistantMessage(streamingContent);
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
        const delta = subtractUsage(usage, lastTurnUsage);
        lastTurnUsage = usage;
        this.store.dispatch((prev) => ({
          task: { ...prev.task, usage },
          sessionUsage: addUsage(prev.sessionUsage, delta),
        }));
      },
      onToolStart: (name: string, args: string, id: string) => {
        if (!this.isActiveTask(taskId, taskAbort)) return;
        this.logger?.logToolStart(name, args, id);
        resetStreaming();
        const s = this.store.getState();
        this.store.dispatch({
          task: { ...s.task, phase: "tool", toolName: name, toolArgs: args, toolsCalled: s.task.toolsCalled + 1 },
        });
        this.appendMessage({
          role: "tool",
          content: `Calling: ${name}(${args.length > 200 ? args.slice(0, 200) + "..." : args})`,
          toolName: name,
        });
      },
      onToolResult: (name: string, resultText: string) => {
        if (!this.isActiveTask(taskId, taskAbort)) return;
        this.logger?.logToolResult(name, resultText);
        resetStreaming();
        this.store.dispatch({
          task: { ...this.store.getState().task, phase: "executing", toolName: undefined, toolArgs: undefined },
        });
        this.appendMessage({ role: "tool", content: resultText, toolName: `${name} result` });
      },
      onRefreshWorkspaceCommits: () => this.refreshWorkspaceCommits(),
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
        }
      },
    };

    try {
      this.compactor.beginTurn();
      const mentionContext = await hydrateMentionContext(contentText);
      if (!this.isActiveTask(taskId, taskAbort)) return;
      for (const warning of mentionContext.warnings) {
        this.appendMessage({ role: "system", content: `⚠ ${warning}` });
      }

      const profiles = this.options.profiles ?? [];
      const plannerProfile = profiles.find((p) => p.id === "planner");
      const coderProfile = profiles.find((p) => p.id === "coder");
      const reviewerProfile = profiles.find((p) => p.id === "reviewer");
      const hasAllProfiles = !!(plannerProfile && coderProfile && reviewerProfile);
      let classification: TaskClassification = {
        phase: "single",
        tier: "coder",
        taskType: "general",
        reason: "",
      };

      const planMode = this.store.getState().planMode;

      if (!forceMultiPhase && !planMode && hasAllProfiles) {
        this.store.dispatch({
          task: { ...this.store.getState().task, phase: "classifying", model: plannerProfile.model },
        });
        this.bus.scheduleRefresh();

        classification = await classifyTask(
          contentText,
          this.options.provider,
          coderProfile.model,  // coder has better instruction following for JSON classification
          taskAbort.signal,
        );
        if (!this.isActiveTask(taskId, taskAbort)) return;
      }

      const useMultiPhase = forceMultiPhase || planMode || (hasAllProfiles && classification.phase === "multi");
      const singlePhaseModel = (() => {
        if (classification.tier === "planner") return plannerProfile?.model;
        if (classification.tier === "reviewer") return reviewerProfile?.model;
        return coderProfile?.model;
      })() ?? this.store.getState().config.model;

      const result = useMultiPhase
        ? await runMultiPhaseAgentLoop({
            provider: this.options.provider,

            coderModel: coderProfile!.model,
            reviewerModel: reviewerProfile!.model,
            history: this.store.getState().agentHistory as ChatMessage[],
            userMessage: { role: "user", content: mentionContext.content },
            toolClient: this.options.toolClient,
            debug: this.store.getState().debug,
            signal: taskAbort.signal,
            compactor: this.compactor,
            confirmEdit: this.makeConfirmEdit(),
            onPhaseStart: (phase, model) => {
              if (!this.isActiveTask(taskId, taskAbort)) return;
              resetStreaming();
              this.store.dispatch({ task: { ...this.store.getState().task, phase, model } });
              this.bus.scheduleRefresh();
            },
            onPlanReady: (plan) => {
              if (!this.isActiveTask(taskId, taskAbort)) return;
              // Remove the streaming assistant message — it contains the same plan content
              // streamed via onToken. Keeping it would show the plan twice (once as an
              // assistant message without prefix, once as "plan: ..." below).
              if (hasStreamingEntry) {
                this.store.dispatch((prev) => ({
                  messages: prev.messages.filter((m) => m.role !== "assistant" || m.content !== streamingContent),
                }));
              }
              resetStreaming();
              this.appendMessage({ role: "tool", content: plan, toolName: "plan" });
              // Persist plan in agentHistory so it survives session save/load.
              this.store.dispatch((prev) => ({
                agentHistory: [
                  ...(prev.agentHistory as ChatMessage[]),
                  { role: "tool" as const, name: "plan", content: plan },
                ],
              }));
              this.bus.scheduleRefresh();
            },
            onPlanWait: () => this.waitForPlanReview(),
            ...sharedCallbacks,
          })
        : await runAgentLoop({
            provider: this.options.provider,
            model: singlePhaseModel,
            history: this.store.getState().agentHistory as ChatMessage[],
            userMessage: { role: "user", content: mentionContext.content },
            toolClient: this.options.toolClient,
            debug: this.store.getState().debug,
            signal: taskAbort.signal,
            compactor: this.compactor,
            confirmEdit: this.makeConfirmEdit(),
            systemContext: `## Current Task (user-provided)\n\n<task>\n${mentionContext.content}\n</task>\n\nFocus only on this task. Do not resume or complete any previous unfinished work unless it directly relates to this request.`,
            ...sharedCallbacks,
          });

      if (!this.isActiveTask(taskId, taskAbort)) return;
      const s = this.store.getState();
      this.store.dispatch({ task: { ...s.task, phase: "done", endTime: Date.now() } });

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
          totalChunks: 0, textChunks: 0,
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

      if (useMultiPhase && !result.usedTools && !result.unsupportedToolCalling) {
        this.appendMessage({
          role: "system",
          content: `⚠ Execute phase completed without any tool calls — the model may not be routing to a tool-capable backend.\nTry /compact to free context, or check your coder profile configuration.`,
        });
      }

      if (hasStreamingEntry && result.text) {
        this.updateLastAssistantMessage(result.text || "(no response)");
      } else if (!hasStreamingEntry) {
        this.appendMessage({ role: "assistant", content: result.text || "(no response)" });
      }

      this.bus.scheduleRefresh();
      // Don't pollute agentHistory with no-tool-call responses from multi-phase execute —
      // they cause the next coder turn to mimic the same "re-plan and apologize" pattern.
      const shouldAddToHistory = !useMultiPhase || result.usedTools || result.unsupportedToolCalling;
      if (shouldAddToHistory) {
        // result.messages already starts with the user message (see agent-loop resultMessages init).
        // Strip base64 images to avoid sending vision content to non-vision models in future turns.
        const historyMessages = result.messages
          .filter((m) => m.role !== "tool")  // tool results must not persist in history
          .map((m) => ({ ...m, content: stripImagesFromContent(m.content) }));
        const nextHistory = [...(this.store.getState().agentHistory as ChatMessage[]), ...historyMessages];
        const cs = this.compactor.getState(nextHistory);
        this.store.dispatch({
          agentHistory: nextHistory,
          compaction: {
            usagePercent: cs.usagePercent,
            compactedCount: cs.compactedCount,
            lastStrategy: cs.lastStrategy,
          },
        });
      }
      this.persistSession();
    } catch (err) {
      if (isAbortError(err) || taskAbort.signal.aborted) return;
      if (isUserRejectedError(err)) {
        this.store.dispatch({ task: { phase: "idle", toolsCalled: 0 } });
        this.appendMessage({ role: "system", content: "Edit rejected — stream stopped. Continue chatting to try a different approach." });
        this.persistSession();
        return;
      }
      this.store.dispatch({ task: { phase: "idle", toolsCalled: 0 } });
      this.logger?.logError(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      const isContextFull =
        errMsg.includes("context window") || errMsg.includes("context length") ||
        errMsg.includes("maximum context") || errMsg.includes("token limit") ||
        errMsg.includes("too long") || errMsg.includes("exceeds") ||
        errMsg.includes("input is too long") || errMsg.includes("prompt is too long");
      const isModelBroken =
        errMsg.includes("zero-length") || errMsg.includes("empty document") || errMsg.includes("429");
      const cs = this.store.getState().config;

      if (isContextFull) {
        this.appendMessage({
          role: "system",
          content: "Context window full. Run `/compact` to summarize history, then retry.",
        });
      } else if (isModelBroken && cs.availableModels.length > 1) {
        const strong = cs.availableModels.filter(m => m !== cs.model && isStrongModel(m));
        const newModel = strong[0]
          ?? cs.availableModels.find((m) => m !== cs.model)
          ?? null;
        if (newModel) {
          this.store.dispatch({ config: { ...cs, model: newModel } });
          this.appendMessage({
            role: "system",
            content: `Model "${cs.model}" failed. Auto-switched to "${newModel}". Resend your message to retry.`,
          });
        } else {
          this.appendMessage({ role: "system", content: `Model "${cs.model}" failed and no alternative found.` });
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
      this.appendMessage({ role: "system", content: "Usage: !<shell command>" });
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
      this.store.dispatch({ task: { ...this.store.getState().task, phase: "done", endTime: Date.now() } });
    } catch (err) {
      if (isAbortError(err) || taskAbort.signal.aborted) return;
      if (isUserRejectedError(err)) {
        this.store.dispatch({ task: { phase: "idle", toolsCalled: 0 } });
        this.appendMessage({ role: "system", content: "Edit rejected — stream stopped. Continue chatting to try a different approach." });
        this.persistSession();
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.appendMessage({ role: "system", content: `Shell command failed: ${message}` });
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
      if (preview) {
        // Always show preview so user knows what changed, even in auto-accept mode.
        this.appendMessage({ role: "tool", content: preview, toolName: `${name} preview` });
        // Also persist preview in agentHistory so it survives session save/load.
        this.store.dispatch((prev) => ({
          agentHistory: [
            ...(prev.agentHistory as ChatMessage[]),
            { role: "tool" as const, name: `${name} preview`, content: preview },
          ],
        }));
        this.bus.scheduleRefresh();
      }

      if (this.store.getState().input.autoAccept) return true;

      this.store.dispatch({ confirm: { active: true, toolName: name, preview } });
      const result = await new Promise<boolean>((resolve) => {
        this._confirmResolve = resolve;
      });
      return result;
    };
  }

  // ─── Message helpers ──────────────────────────────────────

  private appendMessage(msg: Message): void {
    this.store.dispatch((prev) => ({
      messages: [...prev.messages, { timestamp: Date.now(), ...msg }],
    }));
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
    return this._activeTaskId === taskId && this._taskAbort === controller && !controller.signal.aborted;
  }

  private formatCancelMessage(task: ReturnType<Store["getState"]>["task"]): string {
    const elapsed = task.startTime
      ? ` after ${Math.max(1, Math.round((Date.now() - task.startTime) / 1000))}s`
      : "";
    if (task.phase === "tool" && task.toolName) {
      return `Task canceled${elapsed} while running ${task.toolName}.`;
    }
    if (task.phase === "streaming") {
      return `Task canceled${elapsed} while streaming the model response.`;
    }
    if (task.phase === "thinking") {
      return `Task canceled${elapsed} while waiting for the model.`;
    }
    return `Task canceled${elapsed}.`;
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
      profiles.find((p) => p.id === "coder")?.model ??
      s.config.model;
    const plannerModel =
      profiles.find((p) => p.id === "planner")?.model ??
      s.config.model;
    return {
      currentModel: s.config.model,
      provider: this.options.provider,
      reviewerModel,
      coderModel,
      plannerModel,
      history: s.agentHistory as ChatMessage[],
      availableModels: s.config.availableModels,
      toolClient: this.options.toolClient,
      setMessages: (updater: Message[] | ((prev: Message[]) => Message[])) => {
        if (typeof updater === "function") {
          this.store.dispatch((prev) => ({ messages: updater(prev.messages) }));
        } else {
          this.store.dispatch({ messages: updater });
        }
      },
      setHistory: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
        if (typeof updater === "function") {
          this.store.dispatch((prev) => ({ agentHistory: updater(prev.agentHistory as ChatMessage[]) }));
        } else {
          this.store.dispatch({ agentHistory: updater });
        }
      },
      setInputHistory: (updater: string[] | ((prev: string[]) => string[])) => {
        if (typeof updater === "function") {
          this.store.dispatch((prev) => ({ input: { ...prev.input, history: updater(prev.input.history) } }));
        } else {
          this.store.dispatch((prev) => ({ input: { ...prev.input, history: updater } }));
        }
      },
      setCurrentModel: (m: string) => {
        this.store.dispatch((prev) => ({ config: { ...prev.config, model: m } }));
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
      compactHistory: (onProgress?: (step: string) => void) => this.compactHistory(onProgress),
      persistSession: () => this.persistSession(),
      getCompactionStatus: () => ({
        policy: this.compactor.getPolicy(),
        state: this.compactor.getState(this.store.getState().agentHistory as ChatMessage[]),
      }),
      resend: () => {
        const cs = this.store.getState();
        if (cs.input.lastUserText && !cs.input.busy) this.handleSubmit(cs.input.lastUserText);
      },
      exit: () => {
        process.stdout.write("\x1b[?1000l\x1b[?1006l");
        process.exit(0);
      },
      currentSessionId: this._sessionId ?? undefined,
      newSession: () => this.startNewSession(),
      loadSessionById: (id: string) => this.loadSessionById(id),
      startSubprocess: (command: string) => {
        this.store.dispatch({ subprocess: { active: true, command, logLines: [] } });
      },
      logSubprocess: (line: string) => {
        this.store.dispatch((prev) => ({
          subprocess: { ...prev.subprocess, logLines: [...prev.subprocess.logLines, line] },
        }));
      },
      endSubprocess: () => {
        this.store.dispatch({ subprocess: { active: false, command: "", logLines: [] } });
      },
      refreshWorkspaceCommits: () => this.refreshWorkspaceCommits(),
    };
  }
}
