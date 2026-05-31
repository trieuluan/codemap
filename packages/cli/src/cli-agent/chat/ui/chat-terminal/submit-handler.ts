import path from "node:path";

import type { EventBus, TaskPhase } from "../event-bus.js";
import type { Store, Message } from "../store.js";
import type { DebugLogger } from "../../../core/debug-logger.js";
import type { NineRouterProvider } from "../../../core/provider.js";
import type { CodeMapMcpToolClient } from "../../mcp-tools/mcp-tool-client.js";
import type { GatewayModel, TokenUsage } from "../../../types.js";
import type { ChatUiMode } from "../../harness/cli-runtime.js";
import type {
  AskQuestionOption,
  HarnessQuestionAnswer,
} from "../../harness/events.js";
import {
  withToolCallSummary,
  markToolDone,
  setToolCallPreview,
} from "../tool-call-messages.js";
import {
  buildLocalIndex,
  refreshLocalFile,
  removeLocalFile,
} from "@codemap/core/lib/local-index.js";
import { runShell } from "../../slash-commands/shell.js";
import { buildCodeMapAgentInstructions, buildCurrentTaskContent } from "./agent-instructions.js";
import { isStrongModel } from "./workspace-helpers.js";
import { runSingleAgentRuntime } from "../../harness/cli-runtime.js";
import { classifyTask } from "../../../core/task-classifier.js";
import { getMastraCurrentModelId, getMastraThreadTokenUsage } from "../../harness/harness-runtime.js";
import { resolveGatewayModel } from "../../harness/models.js";
import { hydrateMentionContext } from "../../../core/mention-context.js";
import { syncTaskListFromTool } from "../tool-call-messages.js";

function createAbortError(): Error {
  const err = new Error("Task canceled.");
  err.name = "AbortError";
  return err;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

export interface ChatTerminalOptions {
  provider: NineRouterProvider;
  model: string;
  toolClient: CodeMapMcpToolClient;
  availableModels?: GatewayModel[];
  apiToken?: string;
  mcpConfig?: import("@codemap/core/config.js").McpServerConfig;
  uiMode?: ChatUiMode;
}

export interface SubmitHandlerContext {
  store: Store;
  bus: EventBus;
  logger: DebugLogger | null;
  options: ChatTerminalOptions;

  appendMessage(msg: Message): number;
  updateLastAssistantMessage(content: string): void;
  refreshWorkspaceCommits(): Promise<void>;

  beginTask(controller: AbortController): number;
  finishTask(taskId: number): void;
  isActiveTask(taskId: number, controller: AbortController): boolean;

  getSessionResourceContext(signal?: AbortSignal): Promise<string | null>;
  getSessionProjectContext(): Promise<{
    conventions: string | null;
    rules: string | null;
    skills: string | null;
  }>;
}

function abortable<T>(
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

export async function handleSubmitWithContent(
  ctx: SubmitHandlerContext,
  text: string,
  options?: {
    forceMultiPhase?: boolean;
    imageFiles?: Array<{ data: string; mimeType: string }>;
  },
): Promise<void> {
  const { store, bus, logger } = ctx;
  const forceMultiPhase = options?.forceMultiPhase;
  const imageFiles = options?.imageFiles;

  store.dispatch((prev) => ({ input: { ...prev.input, busy: true } }));
  const taskAbort = new AbortController();
  const taskId = ctx.beginTask(taskAbort);

  ctx.appendMessage({ role: "user", content: text });
  store.dispatch({
    task: {
      phase: "thinking",
      startTime: Date.now(),
      toolsCalled: 0,
      model: store.getState().config.model,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    },
  });
  bus.scheduleRefresh();

  let streamingContent = "";
  let hasStreamingEntry = false;
  let currentMessageCreatedAt: number | undefined;
  let fullIndexRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  const dirtyLocalIndexPaths = new Set<string>();
  const toolArgsById = new Map<string, { name: string; args: string }>();

  const extractEditedPath = (
    toolName: string,
    argsText: string,
  ): string | null => {
    if (
      ![
        "write_file",
        "string_replace_lsp",
        "ast_smart_edit",
        "delete_file",
      ].includes(toolName)
    )
      return null;
    try {
      const args = JSON.parse(argsText) as { path?: unknown };
      return typeof args.path === "string" && args.path.trim()
        ? args.path.trim()
        : null;
    } catch {
      return null;
    }
  };

  const scheduleFullLocalIndexRefresh = () => {
    if (fullIndexRefreshTimer) clearTimeout(fullIndexRefreshTimer);
    fullIndexRefreshTimer = setTimeout(() => {
      fullIndexRefreshTimer = null;
      void buildLocalIndex().catch((error: unknown) => {
        logger?.logDebugInfo({
          event: "local_index_refresh_failed",
          error: String(error),
        });
      });
    }, 3_000);
  };

  const resetStreaming = () => {
    streamingContent = "";
    hasStreamingEntry = false;
    store.dispatch({
      streaming: { active: false, content: "", entryIndex: -1 },
    });
  };

  const sharedCallbacks = {
    onStreamReset: () => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      streamingContent = "";
      currentMessageCreatedAt = undefined;
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
        const newMsgs = withToolCallSummary(prev.messages, name, args, id, currentMessageCreatedAt);
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

      const editedPath = extractEditedPath(rawName, rawArgs);
      if (editedPath) {
        const relativePath = path.isAbsolute(editedPath)
          ? path.relative(process.cwd(), editedPath)
          : editedPath;
        if (!relativePath.startsWith("..")) {
          dirtyLocalIndexPaths.add(relativePath);
          const isDelete = rawName === "delete_file";
          const refresh = isDelete
            ? removeLocalFile(relativePath).then((removed: boolean) => removed)
            : refreshLocalFile(relativePath).then((updated: boolean) => updated);
          void refresh
            .then((changed: boolean) => {
              if (changed) scheduleFullLocalIndexRefresh();
            })
            .catch((error: unknown) => {
              logger?.logDebugInfo({
                event: isDelete
                  ? "local_file_remove_failed"
                  : "local_file_refresh_failed",
                filePath: relativePath,
                error: String(error),
              });
            });
        }
      }

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
      void import("./plan-review.js").then(({ waitForAskQuestion }) => {
        waitForAskQuestion(ctx, questionId, question, askOptions, selectionMode)
          .then((answer) => {
            respond(answer);
          })
          .catch(() => {
            respond("(skipped)");
          });
      });
    },
  };

  try {
    const mentionContext = await hydrateMentionContext(text);
    if (!ctx.isActiveTask(taskId, taskAbort)) return;
    for (const warning of mentionContext.warnings) {
      ctx.appendMessage({ role: "system", content: `⚠ ${warning}` });
    }

    const currentModel = store.getState().config.model;
    let classification: Awaited<ReturnType<typeof classifyTask>> = {
      phase: "single",
      taskType: "general",
      reason: "",
      effort: "medium",
    };

    const planMode = store.getState().planMode;

    if (!forceMultiPhase && !planMode) {
      store.dispatch({
        task: {
          ...store.getState().task,
          phase: "classifying",
          model: currentModel,
        },
      });
      bus.scheduleRefresh();

      classification = await classifyTask(
        text,
        ctx.options.provider,
        currentModel,
        taskAbort.signal,
      );
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      store.dispatch({
        task: {
          ...store.getState().task,
          phase: "thinking",
          effort: classification.effort,
        },
      });
      bus.scheduleRefresh();
    }

    const useMultiPhase =
      forceMultiPhase || planMode || classification.phase === "multi";

    if (useMultiPhase) {
      store.dispatch({
        task: { ...store.getState().task, effort: "high" },
      });
    } else {
      store.dispatch({
        task: {
          ...store.getState().task,
          effort: classification.effort,
        },
      });
    }

    const [sessionResourceCtx, sessionProjectCtx] = await Promise.all([
      ctx.getSessionResourceContext(taskAbort.signal),
      ctx.getSessionProjectContext(),
    ]);
    const resolvedAgentModel =
      getMastraCurrentModelId() ??
      resolveGatewayModel(
        store.getState().config.model,
        store.getState().config.availableModels.map((m: GatewayModel) => m.id),
      );
    const agentInstructions = buildCodeMapAgentInstructions(
      sessionResourceCtx,
      sessionProjectCtx,
      resolvedAgentModel,
    );
    const handlePlanReady = (_plan: string) => {
      if (!ctx.isActiveTask(taskId, taskAbort)) return;
      resetStreaming();
    };

    const result = await runSingleAgentRuntime({
      provider: ctx.options.provider,
      model: store.getState().config.model,
      availableModels: store
        .getState()
        .config.availableModels.map((m: GatewayModel) => m.id),
      agentInstructions,
      userMessage: {
        role: "user",
        content: buildCurrentTaskContent(mentionContext.content),
      },
      toolClient: ctx.options.toolClient,
      signal: taskAbort.signal,
      effort: useMultiPhase ? "high" : classification.effort,
      planMode: useMultiPhase || undefined,
      onPhaseStart: useMultiPhase
        ? (phase: string, model: string) => {
            if (!ctx.isActiveTask(taskId, taskAbort)) return;
            resetStreaming();
            store.dispatch({
              task: {
                ...store.getState().task,
                phase: phase as TaskPhase,
                model,
                effort: "high",
              },
            });
            bus.scheduleRefresh();
          }
        : undefined,
      onPlanReady: handlePlanReady,
      onPlanWait: () =>
        import("./plan-review.js").then(({ waitForPlanReview }) =>
          waitForPlanReview(ctx),
        ),
      imageFiles,
      ...sharedCallbacks,
    });

    if (!ctx.isActiveTask(taskId, taskAbort)) return;
    const s = store.getState();
    store.dispatch({
      task: {
        ...s.task,
        phase: "done",
        toolName: undefined,
        toolArgs: undefined,
        endTime: Date.now(),
      },
    });

    if (useMultiPhase && planMode && !forceMultiPhase) {
      store.dispatch({ planMode: false });
    }

    if (logger) {
      const toolCallsList = result.messages
        .filter(
          (m: { role: string; toolCalls?: unknown[] }) =>
            m.role === "assistant" && m.toolCalls,
        )
        .flatMap(
          (m: { toolCalls?: { function: { name: string } }[] }) =>
            m.toolCalls ?? [],
        )
        .map(
          (tc: { function: { name: string } }) => tc.function.name,
        );
      logger.logSummary({
        totalChunks: 0,
        textChunks: 0,
        toolCallChunks: toolCallsList.length,
        finalToolCalls: toolCallsList,
        model: store.getState().config.model,
      });
    }

    if (result.unsupportedToolCalling) {
      const cs = store.getState().config;
      ctx.appendMessage({
        role: "system",
        content: `⚠ Model "${cs.model}" does not support tool calling — the coder generated text instead of using tools.\nCheck your coder profile in config and switch to a tool-capable model.`,
      });
    }

    if (
      useMultiPhase &&
      !result.usedTools &&
      !result.unsupportedToolCalling
    ) {
      ctx.appendMessage({
        role: "system",
        content: `⚠ Execute phase completed without any tool calls — the model may not be routing to a tool-capable backend.\nCheck your coder profile configuration or start a new session with /new.`,
      });
    }

    if (hasStreamingEntry && result.text) {
      ctx.updateLastAssistantMessage(result.text || "(no response)");
    } else if (!hasStreamingEntry) {
      ctx.appendMessage({
        role: "assistant",
        content: result.text || "(no response)",
      });
    }

    resetStreaming();
    bus.scheduleRefresh();

    const mastraUsage = await getMastraThreadTokenUsage().catch(() => null);
    store.dispatch({
      sessionTokens: mastraUsage?.totalTokens ?? 0,
    });
    bus.scheduleRefresh();
  } catch (err) {
    if (isAbortError(err) || taskAbort.signal.aborted) return;
    store.dispatch({ task: { phase: "idle", toolsCalled: 0 } });
    logger?.logError(err);
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
    const isImageUnsupported =
      errMsg.includes("image input") || errMsg.includes("support image");
    const cs = store.getState().config;

    if (isContextFull) {
      ctx.appendMessage({
        role: "system",
        content:
          "Context window full. Start a new session with /new to free context.",
      });
    } else if (isModelBroken && cs.availableModels.length > 1) {
      const strong = cs.availableModels.filter(
        (m: GatewayModel) => m.id !== cs.model && isStrongModel(m.id),
      );
      const newModel =
        strong[0] ??
        cs.availableModels.find(
          (m: GatewayModel) => m.id !== cs.model,
        ) ??
        null;
      if (newModel) {
        store.dispatch({ config: { ...cs, model: newModel.id } });
        ctx.appendMessage({
          role: "system",
          content: `Model "${cs.model}" failed. Auto-switched to "${newModel}". Resend your message to retry.`,
        });
      } else {
        ctx.appendMessage({
          role: "system",
          content: `Model "${cs.model}" failed and no alternative found.`,
        });
      }
    } else if (isImageUnsupported) {
      ctx.appendMessage({
        role: "system",
        content: imageFiles?.length
          ? `Model "${cs.model}" does not support image input. Switch to a vision-capable model with /model, or resend without images.`
          : `Model "${cs.model}" does not support image input.`,
      });
    } else {
      ctx.appendMessage({ role: "system", content: `Error: ${errMsg}` });
    }
  }

  if (ctx.isActiveTask(taskId, taskAbort)) {
    ctx.finishTask(taskId);
  }
}

export async function handleShellSubmit(
  ctx: SubmitHandlerContext,
  text: string,
): Promise<void> {
  const { store } = ctx;
  const command = text.slice(1).trim();
  if (!command) {
    ctx.appendMessage({
      role: "system",
      content: "Usage: !<shell command>",
    });
    return;
  }

  store.dispatch((prev) => ({ input: { ...prev.input, busy: true } }));
  ctx.appendMessage({ role: "user", content: text });
  store.dispatch({
    task: {
      phase: "tool",
      startTime: Date.now(),
      toolsCalled: 1,
      toolName: "bash",
      toolArgs: command,
      model: store.getState().config.model,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    },
  });
  const taskAbort = new AbortController();
  const taskId = ctx.beginTask(taskAbort);
  ctx.appendMessage({ role: "tool_call", name: "bash", content: command });

  try {
    const result = await abortable(runShell(command), taskAbort.signal);
    if (!ctx.isActiveTask(taskId, taskAbort)) return;
    const content = result || "(no output)";
    store.dispatch((prev) => ({
      messages: markToolDone(prev.messages, "bash", content),
    }));
    store.dispatch({
      task: {
        ...store.getState().task,
        phase: "done",
        toolName: undefined,
        toolArgs: undefined,
        endTime: Date.now(),
      },
    });
  } catch (err) {
    if (isAbortError(err) || taskAbort.signal.aborted) return;
    const message = err instanceof Error ? err.message : String(err);
    store.dispatch((prev) => ({
      messages: markToolDone(prev.messages, "bash", `[ERROR] ${message}`),
    }));
    ctx.appendMessage({
      role: "system",
      content: `Shell command failed: ${message}`,
    });
    store.dispatch({ task: { phase: "idle", toolsCalled: 0 } });
  } finally {
    if (ctx.isActiveTask(taskId, taskAbort)) {
      ctx.finishTask(taskId);
    }
  }
}
