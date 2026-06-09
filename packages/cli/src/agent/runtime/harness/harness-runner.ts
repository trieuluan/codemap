import {
  bridgeCommonEvent,
  type BridgeCallbacks,
  type HarnessEvent,
  type MastraHarness,
  summarizeHarnessEvent,
} from "../events.js";
import { getLastModelApiError } from "./fetch-interceptor.js";
import { normalizePlanAction } from "./plan-actions.js";
import type { AgentPhase, PlanReviewAction } from "../types.js";
import { AgentLoopResult } from "../../loop/agent-loop.js";

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
      const upstreamError = lastHarnessError ?? getLastModelApiError();
      if (!result.text && upstreamError) {
        fail(upstreamError);
        return;
      }
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
          /* non-fatal — approval response is the important part */
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
    // ~60 s at 30 display_state_changed/sec — abort frozen stream
    const STALE_DISPLAY_THRESHOLD = 1800;

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
      // Deduplicate noisy events before logging
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
        if (summary) callbacks.onDebug?.(summary);
      }

      // Track pending tool calls for stale detection
      if (event.type === "tool_start") pendingToolCalls++;
      if (event.type === "tool_end") pendingToolCalls = Math.max(0, pendingToolCalls - 1);

      // Stale stream detection: display_state_changed fires at ~30Hz from the UI
      // poller. If it keeps arriving with no new content and no pending tool calls,
      // the model stream is frozen — abort and finish with whatever text we have.
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
        return; // display_state_changed needs no further processing
      }

      if (event.type === "mode_changed") {
        const ev = event as HarnessEvent & { modeId?: string };
        const modelId = harness.getCurrentModelId?.() ?? "";
        if (ev.modeId === "plan") callbacks.onPhaseStart?.("planning", modelId);
        else if (ev.modeId === "build") {
          callbacks.onPhaseStart?.("executing", modelId);
          // Plan phase is ending. The harness emits message_end immediately
          // after this mode_changed — flag it so that message_end handler skips
          // the premature resolve and waits for the build phase instead.
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
            // New tokens arrived — reset stale counter to avoid false-positive
            // finish while the model is actively streaming.
            if (v.length !== lastDisplayStreamLength) {
              staleDisplayCount = 0;
              lastDisplayStreamLength = v.length;
            }
          },
        },
        currentThinkingRef: {
          get: () => currentThinking,
          set: (v) => {
            currentThinking = v;
          },
        },
        finalTextRef: {
          get: () => finalText,
          set: (v) => {
            finalText = v;
          },
        },
        usedToolsRef: {
          get: () => usedTools,
          set: (v) => {
            usedTools = v;
          },
        },
        onPlanApproval: (planId, plan) => {
          handlePlanApproval(planId, plan).catch(fail);
        },
        onEnd: () => {
          // Block agent_end while waiting for the build phase to start; a
          // synthetic agent_end from sendMessage can fire between the plan
          // phase ending and the system-reminder triggering the build phase.
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
        // Build phase has actually started — safe to accept the next message_end.
        awaitingBuildPhase = false;
      }
      if (event.type === "message_end" && finalText.trim()) {
        if (awaitingBuildPhase) {
          // This message_end belongs to the plan phase; the build phase hasn't
          // started yet (no message_start received). Discard plan-phase text
          // and keep waiting. awaitingBuildPhase is cleared on message_start.
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
    });

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
  // Prefer sendMessage: it awaits until stream idle and emits agent_end fallback,
  // which guarantees the run resolves even when the server omits agent_end.
  if (harness.sendMessage) {
    const files = imageFiles?.map((f) => ({
      data: f.data,
      mediaType: f.mimeType,
    }));
    await harness.sendMessage({ content, files });
    onDebug?.({ event: "mastra_send_message_done" });
    return;
  }
  // Fallback: sendSignal — accepted promise resolves quickly but provides no
  // agent_end guarantee; stale detection covers the stuck-stream case.
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
