import type { NineRouterProvider } from "../../provider.js";
import type { ModelProfile, TokenUsage } from "../../types.js";
import type { CodeMapMcpToolClient } from "../mcp/mcp-tool-client.js";
import { fetchResourceContext } from "../mcp/mcp-tool-client.js";
import { getCachedContext } from "../../convention-synthesizer.js";
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
  warmupHarness,
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
import {
  Store,
  createInitialState,
  type Message,
} from "./store.js";
import {
  markLastPendingToolCallCanceled,
  markToolDone,
  setToolCallPreview,
  withToolCallSummary,
} from "./tool-call-messages.js";
import { loadThreadIntoUI } from "../commands/sessions.js";

// Re-export for backward compat with commands/index.ts
export type { Message as ChatEntry } from "./store.js";

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

const CODEMAP_AGENT_IDENTITY = [
  "## CodeMap Identity",
  "",
  "You are CodeMap, the AI-powered code intelligence and coding agent CLI.",
  "Mastra and mastracode are internal runtime implementation details, not the product identity.",
  "Never identify yourself as Mastra Code, Mastra, Claude Code, Codex, or another host/runtime.",
  "If asked what AI coding tool you are, answer that you are CodeMap.",
  "Help the user read, understand, modify, and verify code in the current workspace.",
].join("\n");

function buildSessionContext(modelId?: string): string | null {
  return modelId
    ? `## Session Info\n\nYou are running as model: **${modelId}**`
    : null;
}

export function buildCurrentTaskContent(content: string): string {
  return [
    "## Current Task",
    "",
    "<task>",
    content,
    "</task>",
    "",
    "Work only on this task. When calling recommend_agent_workflow or explore_task, use the task above as the description.",
  ].join("\n");
}

export function buildCodeMapAgentInstructions(
  resourceContext: string | null,
  projectContext: {
    conventions: string | null;
    rules: string | null;
    skills: string | null;
  } | null,
  modelId?: string,
): string {
  const parts: string[] = [CODEMAP_AGENT_IDENTITY];
  const sessionContext = buildSessionContext(modelId);
  if (sessionContext) parts.push(sessionContext);
  if (projectContext?.rules) parts.push(projectContext.rules);
  if (projectContext?.conventions) parts.push(projectContext.conventions);
  if (projectContext?.skills) parts.push(projectContext.skills);
  if (resourceContext) parts.push(resourceContext);
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
    const msgs = state.messages as Message[];
    const lastUserIdx = msgs.reduce(
      (acc, m, i) => (m.role === "user" ? i : acc),
      -1,
    );
    const hasMessagesAfterLastUser =
      lastUserIdx >= 0 && msgs.slice(lastUserIdx + 1).length > 0;
    const hasStreamingContent = Boolean(state.streaming.content.trim());
    const shouldRollback = !hasMessagesAfterLastUser && !hasStreamingContent;

    this._taskAbort?.abort();
    this._taskAbort = null;
    this._activeTaskId = 0;
    this._planReviewResolve?.("cancel");
    this._planReviewResolve = null;

    const nextMessages = shouldRollback
      ? lastUserIdx >= 0
        ? msgs.slice(0, lastUserIdx)
        : msgs
      : markLastPendingToolCallCanceled(msgs);

    this.store.dispatch({
      messages: nextMessages,
      input: { ...state.input, busy: false },
      task: { phase: "idle", toolsCalled: 0 },
      planReview: { active: false, selection: 0 },
      streaming: { active: false, content: "", entryIndex: -1 },
    });
    return shouldRollback ? canceledPrompt : null;
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

    // Pre-initialize Mastra harness in background so the first chat turn has no cold-start delay.
    const startupProfiles = this.options.profiles ?? [];
    const startupModel =
      startupProfiles.find((p) => p.id === "coder")?.model ??
      this.store.getState().config.model;
    warmupHarness({
      toolClient: this.options.toolClient,
      baseUrl: this.options.provider.baseUrl,
      apiKey: this.options.provider.apiKey,
      modelId: startupModel,
      availableModels: this.store.getState().config.availableModels,
      onDebug: undefined,
      extraServerConfigs: this.options.toolClient.getExtraServerConfigs(),
    }).catch(() => { /* best-effort startup warmup */ });

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
    await this.handleSubmitWithContent(text);
  }

  async handleSubmitWithContent(
    text: string,
    forceMultiPhase = false,
    imageFiles?: Array<{ data: string; mimeType: string }>,
  ): Promise<void> {
    const state = this.store.getState();
    if (state.input.busy) return;

    // /plan — toggle plan mode on/off (like Claude Code's /plan)
    // /plan <message> — force multi-phase for this single message (prefix shortcut)
    if (/^\/plan(\s|$)/i.test(text)) {
      const taskText = text.replace(/^\/plan\s*/i, "").trim();
      if (taskText) {
        // Has message → force multi-phase for this message only
        await this.handleSubmitWithContent(taskText, true);
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
    if (text.startsWith("/")) {
      if (text === "/help") {
        this.store.dispatch({ screen: "help" });
        return;
      }
      const handled = executeCommand(text, this.buildCommandContext());
      if (!handled) {
        this.appendMessage({
          role: "system",
          content: "Unknown command. Type /help for available commands.",
        });
      }
      return;
    }

    if (text.startsWith("!")) {
      await this.handleShellSubmit(text);
      return;
    }

    this.store.dispatch({
      input: { ...state.input, busy: true, lastUserText: text },
    });
    this.appendMessage({ role: "user", content: text });
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
        this.store.dispatch({
          task: {
            ...s.task,
            phase: "streaming",
            toolName: undefined,
            toolArgs: undefined,
          },
        });
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
      onToolStart: (name: string, args: string, id: string, preview?: string) => {
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
        this.store.dispatch((prev) => {
          const newMsgs = withToolCallSummary(prev.messages, name, args, id);
          return {
            messages: preview
              ? setToolCallPreview(newMsgs, preview)
              : newMsgs,
          };
        });
        this.bus.scheduleRefresh();
      },
      onToolResult: (name: string, resultText: string, id?: string) => {
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
        this.store.dispatch((prev) => {
          const newMsgs = markToolDone(prev.messages, name, resultText, id);
          return { messages: newMsgs };
        });
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
      const mentionContext = await hydrateMentionContext(text);
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
          text,
          this.options.provider,
          coderProfile.model, // coder has better instruction following for JSON classification
          taskAbort.signal,
        );
        if (!this.isActiveTask(taskId, taskAbort)) return;
        this.store.dispatch({
          task: { ...this.store.getState().task, phase: "thinking" },
        });
        this.bus.scheduleRefresh();
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
      const resolvedAgentModel =
        getMastraCurrentModelId() ??
        resolveGatewayModel(
          useMultiPhase ? coderProfile!.model : singlePhaseModel,
          this.store.getState().config.availableModels,
        );
      const agentInstructions = buildCodeMapAgentInstructions(
        sessionResourceCtx,
        sessionProjectCtx,
        resolvedAgentModel,
      );

      const result = useMultiPhase
        ? await runMultiPhaseAgentRuntime({
            provider: this.options.provider,
            availableModels: this.store.getState().config.availableModels,
            coderModel: coderProfile!.model,
            reviewerModel: reviewerProfile!.model,
            agentInstructions,
            userMessage: {
              role: "user",
              content: buildCurrentTaskContent(mentionContext.content),
            },
            toolClient: this.options.toolClient,
            signal: taskAbort.signal,
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
                role: "tool_call",
                name: "plan",
                content: "Plan ✓",
                toolResults: [
                  {
                    name: "plan",
                    content: plan,
                    fullContent: plan,
                    success: true,
                  },
                ],
                expandedContent: plan,
              });
              this.bus.scheduleRefresh();
            },
            onPlanWait: () => this.waitForPlanReview(),
            imageFiles,
            ...sharedCallbacks,
          })
        : await runSingleAgentRuntime({
            provider: this.options.provider,
            model: singlePhaseModel,
            availableModels: this.store.getState().config.availableModels,
            agentInstructions,
            userMessage: {
              role: "user",
              content: buildCurrentTaskContent(mentionContext.content),
            },
            toolClient: this.options.toolClient,
            signal: taskAbort.signal,
            imageFiles,
            ...sharedCallbacks,
          });

      if (!this.isActiveTask(taskId, taskAbort)) return;
      const s = this.store.getState();
      this.store.dispatch({
        task: {
          ...s.task,
          phase: "done",
          toolName: undefined,
          toolArgs: undefined,
          endTime: Date.now(),
        },
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
    this.appendMessage({ role: "tool_call", name: "bash", content: command });

    try {
      const result = await abortable(
        this.options.toolClient.callTool("bash", { command }),
        taskAbort.signal,
      );
      if (!this.isActiveTask(taskId, taskAbort)) return;
      const content = result.content || "(no output)";
      this.store.dispatch((prev) => ({
        messages: markToolDone(prev.messages, "bash", content),
      }));
      this.store.dispatch({
        task: {
          ...this.store.getState().task,
          phase: "done",
          toolName: undefined,
          toolArgs: undefined,
          endTime: Date.now(),
        },
      });
    } catch (err) {
      if (isAbortError(err) || taskAbort.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      this.store.dispatch((prev) => ({
        messages: markToolDone(prev.messages, "bash", `[ERROR] ${message}`),
      }));
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
        if (msgs[i]!.role === "assistant") {
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
        this.store.dispatch((prev) => ({
          debug: d,
          config: { ...prev.config, debug: d },
        }));
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
      reinitHarness: async () => {
        await resetHarnessSingleton();
        await warmupHarness({
          toolClient: this.options.toolClient,
          baseUrl: this.options.provider.baseUrl,
          apiKey: this.options.provider.apiKey,
          modelId: (() => {
            const p = this.options.profiles ?? [];
            return p.find((pr) => pr.id === "coder")?.model ?? this.store.getState().config.model;
          })(),
          availableModels: this.store.getState().config.availableModels,
          onDebug: undefined,
          extraServerConfigs: this.options.toolClient.getExtraServerConfigs(),
        });
      },
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
