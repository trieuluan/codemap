import type { TaskPhase } from "../../events/event-bus.js";
import type { GatewayModel } from "../../../agent/types.js";
import { markToolDone } from "../ui/tool-call-messages.js";
import { runShell } from "../../slash-commands/shell.js";
import { buildCodeMapAgentInstructions, buildCurrentTaskContent } from "../config/agent-instructions.js";
import { runSingleAgentRuntime } from "../../../agent/runtime/cli-runtime.js";
import { classifyTask } from "../../../agent/loop/task-classifier.js";
import {
  getMastraCurrentModelId,
  getMastraThreadTokenUsage,
} from "../../../agent/runtime/harness-runtime.js";
import { resolveGatewayModel } from "../../../agent/runtime/config/models.js";
import { hydrateMentionContext } from "../../../agent/prompt/mention-context.js";
import { abortable, isAbortError } from "./abort.js";
import type { SubmitHandlerContext } from "./context.js";
import { handleSubmitError } from "./errors.js";
import { createSubmitLocalIndexTracker } from "./local-index.js";
import { createSubmitRuntimeCallbacks } from "./runtime-callbacks.js";

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

  const localIndexTracker = createSubmitLocalIndexTracker(logger);
  const runtimeCallbacks = createSubmitRuntimeCallbacks({
    ctx,
    store,
    bus,
    logger,
    taskId,
    taskAbort,
    localIndexTracker,
  });

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
      runtimeCallbacks.resetStreaming();
    };

    const result = await runSingleAgentRuntime({
      provider: ctx.options.provider,
      providerId: ctx.options.gatewayConfig.provider,
      model: store.getState().config.model,
      modeDefaults: ctx.options.gatewayConfig.modeDefaults,
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
            runtimeCallbacks.resetStreaming();
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
        import("../ui/plan-review.js").then(({ waitForPlanReview }) =>
          waitForPlanReview(ctx),
        ),
      imageFiles,
      ...runtimeCallbacks.callbacks,
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
        .map((tc: { function: { name: string } }) => tc.function.name);
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

    if (useMultiPhase && !result.usedTools && !result.unsupportedToolCalling) {
      ctx.appendMessage({
        role: "system",
        content: `⚠ Execute phase completed without any tool calls — the model may not be routing to a tool-capable backend.\nCheck your coder profile configuration or start a new session with /new.`,
      });
    }

    if (runtimeCallbacks.hasStreamingEntry() && result.text) {
      runtimeCallbacks.updateFinalStreamingMessage(
        result.text || "(no response)",
      );
    } else if (!runtimeCallbacks.hasStreamingEntry()) {
      ctx.appendMessage({
        role: "assistant",
        content: result.text || "(no response)",
      });
    }

    runtimeCallbacks.resetStreaming();
    bus.scheduleRefresh();

    const mastraUsage = await getMastraThreadTokenUsage().catch(() => null);
    store.dispatch({
      sessionTokens: mastraUsage?.totalTokens ?? 0,
    });
    bus.scheduleRefresh();
  } catch (err) {
    if (isAbortError(err) || taskAbort.signal.aborted) return;
    logger?.logError(err);
    handleSubmitError(err, store, ctx.appendMessage, imageFiles);
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
