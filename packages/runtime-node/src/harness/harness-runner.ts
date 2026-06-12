import {
  bridgeCommonEvent,
  type BridgeCallbacks,
  type HarnessEvent,
  type MastraHarness,
  summarizeHarnessEvent,
} from "../events.js";
import { getLastModelApiError } from "./fetch-interceptor.js";
import { normalizePlanAction } from "./plan-actions.js";
import type { AgentPhase, PlanReviewAction } from "../runtime-input.js";
import type { AgentLoopResult } from "@codemap-ai/core/agent";

type RunHarnessCallbacks = Omit<
  BridgeCallbacks,
  | "harness"
  | "currentStreamTextRef"
  | "currentThinkingRef"
  | "finalTextRef"
  | "usedToolsRef"
  | "onPlanApproval"
  | "onEnd"
  | "onError"
> & {
  onPlanReady?: (plan: string) => void;
  onPlanWait?: () => Promise<PlanReviewAction>;
  onPhaseStart?: (phase: AgentPhase, model: string) => void;
};

/** Drive the harness for a single-turn message and resolve when agent_end fires. */
export function runHarness(
  harness: MastraHarness,
  userMessage: { role: string; content: string },
  signal: AbortSignal | undefined,
  callbacks: RunHarnessCallbacks,
  imageFiles?: Array<{ data: string; mimeType: string }>,
): Promise<AgentLoopResult> {
  return new Promise<AgentLoopResult>((resolve, reject) => {
    let finalText = "";
    let currentStreamText = "";
    let currentThinking = "";
    let usedTools = false;
    let settled = false;
    let lastHarnessError: Error | null = null;

    const finish = (result: AgentLoopResult) => {
      if (settled) return;
      if (!result.text) {
        void new Promise((r) => setTimeout(r, 100)).then(() =>
          finishEmpty(result),
        );
        return;
      }
      settle(result);
    };
    const finishEmpty = (result: AgentLoopResult) => {
      if (settled) return;
      const upstreamError = lastHarnessError ?? getLastModelApiError();
      if (upstreamError) {
        fail(upstreamError);
        return;
      }
      settle(result);
    };
    const settle = (result: AgentLoopResult) => {
      if (settled) return;
      settled = true;
      callbacks.onDebug?.({
        event: "mastra_run_finish",
        mode: "single",
        textLength: result.text.length,
        usedTools: result.usedTools,
        unsupportedToolCalling: result.unsupportedToolCalling,
      });
      signal?.removeEventListener("abort", onAbort);
      unsubscribe();
      resolve(result);
    };
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      callbacks.onDebug?.({
        event: "mastra_run_fail",
        mode: "single",
        error: err instanceof Error ? err.message : String(err),
      });
      signal?.removeEventListener("abort", onAbort);
      unsubscribe();
      reject(err);
    };

    const handlePlanApproval = async (planId: string, plan: string) => {
      callbacks.onPlanReady?.(plan);
      if (!callbacks.onPlanWait) {
        await harness.respondToPlanApproval?.({
          planId,
          response: { action: "approved" },
        });
        return;
      }

      const raw = await callbacks.onPlanWait();
      const action = normalizePlanAction(raw);
      if (action === "cancel") {
        harness.abort?.();
        finish({
          text: "Plan cancelled.",
          messages: [],
          usedTools: false,
          unsupportedToolCalling: false,
        });
        return;
      }

      if (action === "apply" || action === "implement") {
        await harness.respondToPlanApproval?.({
          planId,
          response: { action: "approved" },
        });
        try {
          const reminder = harness.sendSignal?.({
            type: "system-reminder",
            contents: "The user has approved the plan, begin executing.",
          });
          if (reminder) await reminder.accepted;
        } catch {
          /* non-fatal */
        }
      } else {
        await harness.respondToPlanApproval?.({
          planId,
          response: { action: "rejected", feedback: action },
        });
      }
    };

    const toolCallMeta = new Map<
      string,
      { toolName: string; argsKey: string }
    >();
    const failedToolCounts = new Map<string, number>();
    let awaitingBuildPhase = false;
    let pendingToolCalls = 0;
    let staleDisplayCount = 0;
    let lastDisplayStreamLength = -1;
    let lastMsgUpdateTextLength = -1;
    const STALE_DISPLAY_THRESHOLD = 18000;

    const finishWithCurrentText = () => {
      const raw = harness.getTokenUsage?.();
      const usage = raw
        ? {
            promptTokens: raw.promptTokens ?? 0,
            completionTokens: raw.completionTokens ?? 0,
            totalTokens: raw.totalTokens ?? 0,
          }
        : undefined;
      if (usage) callbacks.onUsage?.(usage);
      finish({
        text: finalText || currentStreamText,
        messages: [userMessage as { role: "user"; content: string }],
        usedTools,
        unsupportedToolCalling: false,
        usage,
      });
    };

    const unsubscribe = harness.subscribe((event: HarnessEvent) => {
      try {
        handleHarnessEvent(event);
      } catch (err) {
        callbacks.onDebug?.({
          event: "mastra_listener_error",
          eventType: event.type,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
    });

    function handleHarnessEvent(event: HarnessEvent): void {
      if (event.type === "message_update") {
        const summary = summarizeHarnessEvent(event, currentStreamText, finalText);
        const newLen =
          typeof (summary as Record<string, unknown> | null)?.textLength === "number"
            ? (summary as Record<string, unknown>).textLength as number
            : -1;
        if (newLen !== lastMsgUpdateTextLength) {
          lastMsgUpdateTextLength = newLen;
          if (summary) callbacks.onDebug?.(summary);
        }
      } else {
        const summary = summarizeHarnessEvent(event, currentStreamText, finalText);
        if (summary) {
          if (event.type === "agent_end") {
            (summary as Record<string, unknown>).omProgress =
              harness.getDisplayState?.()?.omProgress;
          }
          callbacks.onDebug?.(summary);
        }
      }

      if (event.type === "tool_start") pendingToolCalls++;
      if (event.type === "tool_end") pendingToolCalls = Math.max(0, pendingToolCalls - 1);

      if (event.type === "display_state_changed") {
        const curLen = currentStreamText.length;
        if (curLen > 0 && curLen === lastDisplayStreamLength && pendingToolCalls === 0) {
          staleDisplayCount++;
          if (staleDisplayCount >= STALE_DISPLAY_THRESHOLD && !settled) {
            callbacks.onDebug?.({
              event: "mastra_finish_on_stale_stream",
              staleEventCount: staleDisplayCount,
              textLength: curLen,
            });
            harness.abort?.();
            finishWithCurrentText();
          }
        } else {
          staleDisplayCount = 0;
          lastDisplayStreamLength = curLen;
        }
        return;
      }

      if (event.type === "mode_changed") {
        const ev = event as HarnessEvent & { modeId?: string };
        const modelId = harness.getCurrentModelId?.() ?? "";
        if (ev.modeId === "plan") callbacks.onPhaseStart?.("planning", modelId);
        else if (ev.modeId === "build") {
          callbacks.onPhaseStart?.("executing", modelId);
          awaitingBuildPhase = true;
        }
        return;
      }

      bridgeCommonEvent(event, {
        ...callbacks,
        harness,
        currentStreamTextRef: {
          get: () => currentStreamText,
          set: (v) => {
            currentStreamText = v;
            if (v.length !== lastDisplayStreamLength) {
              staleDisplayCount = 0;
              lastDisplayStreamLength = v.length;
            }
          },
        },
        currentThinkingRef: {
          get: () => currentThinking,
          set: (v) => { currentThinking = v; },
        },
        finalTextRef: {
          get: () => finalText,
          set: (v) => { finalText = v; },
        },
        usedToolsRef: {
          get: () => usedTools,
          set: (v) => { usedTools = v; },
        },
        onPlanApproval: (planId, plan) => {
          handlePlanApproval(planId, plan).catch(fail);
        },
        onEnd: () => {
          if (awaitingBuildPhase) return;
          finishWithCurrentText();
        },
        onError: (err) => {
          lastHarnessError =
            err instanceof Error ? err : new Error(String(err));
          fail(lastHarnessError);
        },
      });

      if (event.type === "tool_start") {
        const argsKey = `${event.toolName}:${JSON.stringify(event.args ?? {})}`;
        toolCallMeta.set(event.toolCallId ?? event.toolName, {
          toolName: event.toolName,
          argsKey,
        });
      }
      if (event.type === "tool_end" && event.isError) {
        const meta = toolCallMeta.get(event.toolCallId ?? "");
        if (meta) {
          const count = (failedToolCounts.get(meta.argsKey) ?? 0) + 1;
          failedToolCounts.set(meta.argsKey, count);
          if (count >= 3) {
            const extra =
              meta.toolName === "recall"
                ? ' The "recall" tool requires a valid message ID as cursor value — strings like "latest", "current", or "cur" are not valid. Stop calling this tool and continue from your current conversation context.'
                : ` Stop retrying "${meta.toolName}" and continue from your current conversation context.`;
            harness
              .sendSignal?.({
                type: "system-reminder",
                contents: `"${meta.toolName}" has failed ${count} consecutive times with identical arguments.${extra}`,
              })
              ?.accepted?.catch(() => {});
          }
        }
      }
      if (event.type === "message_start" && awaitingBuildPhase) {
        awaitingBuildPhase = false;
      }
      if (event.type === "message_end" && finalText.trim()) {
        if (awaitingBuildPhase) {
          finalText = "";
          return;
        }
        callbacks.onDebug?.({
          event: "mastra_finish_on_message_end",
          textLength: finalText.length,
          usedTools,
        });
        finishWithCurrentText();
      }
    }

    const onAbort = () => {
      harness.abort?.();
      fail(createAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    sendHarnessInput(
      harness,
      userMessage.content,
      imageFiles,
      callbacks.onDebug,
    ).catch((err: unknown) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

async function sendHarnessInput(
  harness: MastraHarness,
  content: string,
  imageFiles: Array<{ data: string; mimeType: string }> | undefined,
  onDebug?: (info: Record<string, unknown>) => void,
): Promise<void> {
  onDebug?.({
    event: "mastra_send_message_start",
    contentLength: content.length,
    imageCount: imageFiles?.length ?? 0,
  });
  if (harness.sendMessage) {
    const files = imageFiles?.map((f) => ({
      data: f.data,
      mediaType: f.mimeType,
    }));
    await harness.sendMessage({ content, files });
    onDebug?.({ event: "mastra_send_message_done" });
    return;
  }
  if (harness.sendSignal) {
    const signalContent = imageFiles?.length
      ? ([
          { type: "text" as const, text: content },
          ...imageFiles.map((f) => ({
            type: "file" as const,
            data: f.data,
            mediaType: f.mimeType,
          })),
        ] satisfies Array<
          | { type: "text"; text: string }
          | { type: "file"; data: string; mediaType: string }
        >)
      : content;
    const signal = harness.sendSignal({ content: signalContent });
    onDebug?.({
      event: "mastra_send_signal_created",
      signalId: signal.id,
      signalType: signal.type,
    });
    await signal.accepted;
    onDebug?.({ event: "mastra_send_signal_accepted", signalId: signal.id });
    return;
  }
}

function createAbortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}
