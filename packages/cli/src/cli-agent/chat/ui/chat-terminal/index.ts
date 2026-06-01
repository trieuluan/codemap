import type { Message } from "../store.js";
import {
  listMastraThreadMessages,
  resetHarnessSingleton,
} from "../../harness/harness-runtime.js";
import { executeCommand } from "../../slash-commands/index.js";
import { mapHarnessMessagesToUI } from "../../slash-commands/sessions.js";
import { tryGetCurrentWorkspaceInfo } from "@codemap/core/lib/workspace-git.js";
import {
  createDebugLogger,
  type DebugLogger,
} from "../../../core/debug-logger.js";
import { EventBus } from "../event-bus.js";
import { Store, createInitialState } from "../store.js";
import { markLastPendingToolCallCanceled } from "../tool-call-messages.js";

import { buildChatCommandContext } from "./command-context.js";
import { startChatTerminalRuntime } from "./startup.js";
import { extractCloudCommitFromGetProject } from "./workspace-helpers.js";

export { extractCloudCommitFromGetProject };
import {
  createTaskManagerState,
  beginTask,
  finishTask,
  isActiveTask,
  type TaskManagerState,
} from "./task-manager.js";
import {
  waitForPlanReview,
  resolvePlanReview,
  cancelPendingPrompts,
} from "./plan-review.js";
import {
  createSessionContextCache,
  getSessionResourceContext,
  getSessionProjectContext,
  type SessionContextCache,
} from "./session-context.js";
import {
  handleSubmitWithContent,
  handleShellSubmit,
  type SubmitHandlerContext,
} from "./submit-handler.js";
import type { ChatTerminalOptions } from "./types.js";

export type { ChatTerminalOptions } from "./types.js";

export class ChatTerminal {
  // Public so App and InputArea can access
  readonly bus: EventBus;
  readonly store: Store;

  private taskState: TaskManagerState;
  private sessionCache: SessionContextCache;
  private logger: DebugLogger | null = null;
  private options: ChatTerminalOptions;

  constructor(options: ChatTerminalOptions) {
    this.options = options;
    this.bus = new EventBus();

    const debug = process.env.CODEMAP_DEBUG_AGENT_TOOLS === "1";
    this.store = new Store(
      createInitialState({
        model: options.model,
        availableModels: options.availableModels,
        debug,
      }),
      this.bus,
    );

    if (debug) this.logger = createDebugLogger();
    this.taskState = createTaskManagerState();
    this.sessionCache = createSessionContextCache();
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

    // /plan — toggle plan mode on/off
    // /plan <message> — force multi-phase for this single message
    if (/^\/plan(\s|$)/i.test(text)) {
      const taskText = text.replace(/^\/plan\s*/i, "").trim();
      if (taskText) {
        await this.handleSubmitWithContent(taskText, true);
      } else {
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
      await handleShellSubmit(this.createSubmitContext(), text);
      return;
    }

    // Store the user text for resend
    this.store.dispatch((prev) => ({
      input: { ...prev.input, lastUserText: text },
    }));

    await handleSubmitWithContent(this.createSubmitContext(), text, {
      forceMultiPhase,
      imageFiles,
    });
  }

  private createSubmitContext(): SubmitHandlerContext {
    return {
      store: this.store,
      bus: this.bus,
      logger: this.logger,
      options: this.options,
      appendMessage: (msg) => this.appendMessage(msg),
      updateLastAssistantMessage: (content) =>
        this.updateLastAssistantMessage(content),
      refreshWorkspaceCommits: () => this.refreshWorkspaceCommits(),
      beginTask: (controller) => beginTask(this.taskState, controller),
      finishTask: (taskId) =>
        finishTask(
          { store: this.store, bus: this.bus, logger: this.logger },
          this.taskState,
          taskId,
        ),
      isActiveTask: (taskId, controller) =>
        isActiveTask(this.taskState, taskId, controller),
      getSessionResourceContext: (signal) =>
        getSessionResourceContext(
          this.sessionCache,
          this.options.toolClient,
          signal,
        ),
      getSessionProjectContext: () =>
        getSessionProjectContext(this.sessionCache),
    };
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

    this.taskState.taskAbort?.abort();
    this.taskState.taskAbort = null;
    this.taskState.activeTaskId = 0;
    cancelPendingPrompts();

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
      askQuestion: null,
      streaming: { active: false, content: "", entryIndex: -1 },
    });
    return shouldRollback ? canceledPrompt : null;
  }

  waitForPlanReview(): Promise<string> {
    return waitForPlanReview({ bus: this.bus, store: this.store });
  }

  resolvePlanReview(action: string): void {
    resolvePlanReview({ bus: this.bus, store: this.store }, action);
  }

  resolveAskQuestion(
    answer: import("../../harness/events.js").HarnessQuestionAnswer,
  ): void {
    const { resolveAskQuestion } = require("./plan-review.js");
    resolveAskQuestion({ bus: this.bus, store: this.store }, answer);
  }

  // ─── Workspace ───────────────────────────────────────────

  async refreshWorkspaceCommits(): Promise<void> {
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
      // Non-blocking
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
      // Non-blocking
    }
  }

  // ─── Startup ─────────────────────────────────────────────

  async start(): Promise<void> {
    await startChatTerminalRuntime({
      terminal: this,
      store: this.store,
      bus: this.bus,
      options: this.options,
      refreshWorkspaceCommits: () => this.refreshWorkspaceCommits(),
    });
  }

  // ─── Session management ──────────────────────────────────

  persistSession(): void {
    /* no-op: Mastra persists thread storage */
  }

  startNewSession(): void {
    this.store.dispatch((prev) => ({
      messages: [],
      sessionTokens: 0,
      input: { ...prev.input, history: [] },
    }));
    resetHarnessSingleton().catch(() => {});
  }

  async loadMastraThreadMessages(threadId: string): Promise<void> {
    const messages = await listMastraThreadMessages(threadId);
    this.store.dispatch((prev) => ({
      messages: mapHarnessMessagesToUI(messages),
      sessionTokens: 0,
      input: { ...prev.input, history: [] },
    }));
    this.bus.scheduleRefresh();
  }

  // ─── Message helpers ─────────────────────────────────────

  appendMessage(msg: Message): number {
    let index = -1;
    this.store.dispatch((prev) => {
      index = prev.messages.length;
      return {
        messages: [...prev.messages, { timestamp: Date.now(), ...msg }],
      };
    });
    return index;
  }

  updateLastAssistantMessage(content: string): void {
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

  // ─── Command context ─────────────────────────────────────

  private buildCommandContext() {
    return buildChatCommandContext({
      store: this.store,
      bus: this.bus,
      options: this.options,
      getLogger: () => this.logger,
      setLogger: (logger) => {
        this.logger = logger;
      },
      handleSubmit: (text) => this.handleSubmit(text),
      startNewSession: () => this.startNewSession(),
      loadMastraThreadMessages: (threadId) =>
        this.loadMastraThreadMessages(threadId),
      refreshWorkspaceCommits: () => this.refreshWorkspaceCommits(),
    });
  }
}
