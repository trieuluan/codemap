import type { EventBus } from "@codemap-ai/core/agent";
import type { Store } from "../../state/store.js";
import type { DebugLogger } from "../../../agent/utils/debug-logger.js";
import type { TokenUsage } from "@codemap-ai/core/agent";
import type {
  AskQuestionOption,
  HarnessQuestionAnswer,
} from "../../../agent/runtime/events.js";
import type { HarnessDisplayState } from "@mastra/core/harness";
import {
  withToolCallSummary,
  markToolDone,
  setToolCallPreview,
} from "../ui/tool-call-messages.js";
import { syncTaskListFromTool } from "../ui/tool-call-messages.js";
import type { SubmitHandlerContext } from "./context.js";

interface SubmitRuntimeCallbacksOptions {
  ctx: SubmitHandlerContext;
  store: Store;
  bus: EventBus;
  logger: DebugLogger | null;
  taskId: number;
  taskAbort: AbortController;
}

export interface SubmitRuntimeCallbacks {
  hasStreamingEntry(): boolean;
  resetStreaming(): void;
  updateFinalStreamingMessage(text: string): void;
  callbacks: {
    onStreamReset(): void;
    onMessageStart(createdAt: number): void;
    onToken(token: string): void;
    onThinking(text: string): void;
    onModel(model: string): void;
    onUsage(usage: TokenUsage): void;
    onToolStart(
      name: string,
      args: string,
      id: string,
      preview?: string,
    ): void;
    onToolResult(name: string, resultText: string, id?: string): void;
    onOMObservation(tokensObserved: number, observationTokens: number): void;
    onOMReflection(compressedTokens: number): void;
    onDebug(info: Record<string, unknown>): void;
    onAskQuestion(
      questionId: string,
      question: string,
      askOptions: AskQuestionOption[] | undefined,
      respond: (answer: HarnessQuestionAnswer) => void,
      selectionMode?: "single_select" | "multi_select",
    ): void;
  };
}

export function createSubmitRuntimeCallbacks({
  ctx,
  store,
  bus,
  logger,
  taskId,
  taskAbort,
}: SubmitRuntimeCallbacksOptions): SubmitRuntimeCallbacks {
  let streamingContent = "";
  let hasStreamingEntry = false;
  let currentMessageCreatedAt: number | undefined;
  const toolArgsById = new Map<string, { name: string; args: string }>();

  const resetStreaming = () => {
    streamingContent = "";
    hasStreamingEntry = false;
    store.dispatch({
      streaming: { active: false, content: "", entryIndex: -1 },
    });
  };

  const callbacks = {
    onStreamReset: () => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      streamingContent = "";
      currentMessageCreatedAt = undefined;
      // Only clear the streaming indicator — do NOT set task.phase to "done" here.
      // onStreamReset fires between agent turns (not just at the end), so marking
      // "done" prematurely leaves input.busy=true while the UI shows ✓ done.
      // handler.ts sets phase="done" after runSingleAgentRuntime fully resolves.
      store.dispatch({
        streaming: { active: false, content: "", entryIndex: -1 },
      });
      bus.scheduleRefresh();
    },
    onMessageStart: (createdAt: number) => {
      currentMessageCreatedAt = createdAt;
    },
    onToken: (token: string) => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      const s = store.getState();
      if (!s.task || s.task.phase === "idle") return;
      // Thinking ended, text started — update phase
      if (s.task.phase === "thinking") {
        store.dispatch({ task: { ...s.task, phase: "streaming" } });
      }
      streamingContent += token;
      if (!hasStreamingEntry) {
        hasStreamingEntry = true;
        const entryIndex = ctx.appendMessage({
          role: "assistant",
          content: streamingContent,
        });
        store.dispatch({
          streaming: { active: true, content: streamingContent, entryIndex },
        });
      } else {
        ctx.updateLastAssistantMessage(streamingContent);
        store.dispatch((prev) => ({
          streaming: {
            ...prev.streaming,
            active: true,
            content: streamingContent,
          },
        }));
      }
      store.dispatch({
        task: {
          ...s.task,
          phase: "streaming",
          toolName: undefined,
          toolArgs: undefined,
        },
      });
      bus.scheduleRefresh();
    },
    onThinking: (_text: string) => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      const s = store.getState();
      if (s.task && s.task.phase !== "thinking") {
        store.dispatch({ task: { ...s.task, phase: "thinking" } });
      }
    },
    onModel: (model: string) => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      store.dispatch({ task: { ...store.getState().task, model } });
    },
    onUsage: (usage: TokenUsage) => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      store.dispatch((prev) => ({ task: { ...prev.task, usage } }));
    },
    onToolStart: (
      name: string,
      args: string,
      id: string,
      preview?: string,
    ) => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      logger?.logToolStart(name, args, id);
      if (id) toolArgsById.set(id, { name, args });
      streamingContent = "";
      store.dispatch({
        streaming: { active: false, content: "", entryIndex: -1 },
      });
      const s = store.getState();
      store.dispatch({
        task: {
          ...s.task,
          phase: "tool",
          toolName: name,
          toolArgs: args,
          toolsCalled: s.task.toolsCalled + 1,
        },
      });
      store.dispatch((prev) => {
        const newMsgs = withToolCallSummary(
          prev.messages,
          name,
          args,
          id,
          currentMessageCreatedAt,
        );
        return {
          messages: preview ? setToolCallPreview(newMsgs, preview) : newMsgs,
        };
      });
      bus.scheduleRefresh();
    },
    onToolResult: (name: string, resultText: string, id?: string) => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      logger?.logToolResult(name, resultText);
      resetStreaming();
      store.dispatch({
        task: {
          ...store.getState().task,
          phase: "executing",
          toolName: undefined,
          toolArgs: undefined,
        },
      });
      store.dispatch((prev) => {
        const newMsgs = markToolDone(prev.messages, name, resultText, id);
        return { messages: newMsgs };
      });

      const toolMeta = id ? toolArgsById.get(id) : undefined;
      const rawName = toolMeta?.name ?? name;
      const rawArgs = toolMeta?.args ?? "{}";

      if (id) toolArgsById.delete(id);
      syncTaskListFromTool(store, rawName, rawArgs, resultText);

      bus.scheduleRefresh();
    },
    onOMObservation: (tokensObserved: number, observationTokens: number) => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      ctx.appendMessage({
        role: "system",
        content: `🧠 Memory: observed ${tokensObserved.toLocaleString()} tokens → distilled to ${observationTokens.toLocaleString()} observation tokens`,
      });
      bus.scheduleRefresh();
    },
    onOMReflection: (compressedTokens: number) => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      ctx.appendMessage({
        role: "system",
        content: `🧠 Memory: reflected & compressed ${compressedTokens.toLocaleString()} tokens`,
      });
      bus.scheduleRefresh();
    },
    onDebug: (info: Record<string, unknown>) => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      if (!store.getState().debug) return;
      if (info.event === "stream_request") {
        logger?.logStreamRequest({
          model: String(info.model ?? ""),
          messageCount: Number(info.messageCount ?? 0),
          toolCount: Number(info.toolCount ?? 0),
          hasSystem: Boolean(info.hasSystem),
          toolsCalled: store.getState().task.toolsCalled,
        });
      } else if (info.event === "tool_fallback") {
        logger?.logToolFallback(String(info.reason ?? ""));
      } else {
        logger?.logDebugInfo(info);
      }
    },
    onAskQuestion: (
      questionId: string,
      question: string,
      askOptions: AskQuestionOption[] | undefined,
      respond: (answer: HarnessQuestionAnswer) => void,
      selectionMode?: "single_select" | "multi_select",
    ) => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      // Lazy import to avoid circular dep with plan-review
      void import("../ui/plan-review.js").then(({ waitForAskQuestion }) => {
        waitForAskQuestion(ctx, questionId, question, askOptions, selectionMode)
          .then((answer) => {
            respond(answer);
          })
          .catch(() => {
            respond("(skipped)");
          });
      });
    },
    onToolApproval: (
      pendingApproval: NonNullable<HarnessDisplayState["pendingApproval"]>,
      respond: (decision: "approve" | "decline" | "always_allow_category") => void,
    ) => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      void import("../ui/plan-review.js").then(({ waitForToolApproval }) => {
        waitForToolApproval(ctx, pendingApproval)
          .then((decision) => {
            respond(decision);
          })
          .catch(() => {
            respond("decline");
          });
      });
    },
  };

  return {
    hasStreamingEntry: () => hasStreamingEntry,
    resetStreaming,
    updateFinalStreamingMessage(text) {
      ctx.updateLastAssistantMessage(text || "(no response)");
    },
    callbacks,
  };
}
