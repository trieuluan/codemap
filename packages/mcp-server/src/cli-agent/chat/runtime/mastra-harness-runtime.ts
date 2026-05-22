import { rm } from "node:fs/promises";
import path from "node:path";
import type { AgentLoopResult } from "../agent/agent-loop.js";
import type { SingleAgentRuntimeInput, MultiPhaseLoopInput } from "./cli-runtime.js";
import { bridgeCommonEvent, type BridgeCallbacks, type HarnessEvent, type HarnessLike, summarizeHarnessEvent } from "./mastra-events.js";
import { resolveHarnessModelId } from "./mastra-models.js";
import { createManagedMastraSettings, upsertGlobalMastraProvider } from "./mastra-settings.js";

type DynamicImport = (specifier: string) => Promise<Record<string, unknown>>;

const dynamicImport = new Function(
  "specifier",
  "return import(specifier)",
) as DynamicImport;

const IMPLEMENT_SYNONYMS = new Set([
  "implement", "ok", "okay", "yes", "y", "go", "proceed", "sure", "do it",
  "ừ", "ừm", "đồng ý", "được", "làm đi", "làm luôn", "tiếp tục", "ok luôn",
]);
const CANCEL_SYNONYMS = new Set([
  "cancel", "no", "n", "stop", "abort", "quit", "exit",
  "không", "thôi", "dừng", "hủy",
]);

const MASTRA_AGENT_TIMEOUT_MS = 120_000;

const MASTRA_DISABLED_TOOLS = [
  "request_access",
  "codemap_get_agent_workflow",
  "codemap_recommend_agent_workflow",
  "codemap_doctor_agent_pack",
  "codemap_get_project",
  "codemap_list_projects",
  "codemap_start_auth_flow",
  "codemap_check_auth_status",
  "codemap_wait_for_auth",
  "codemap_wait_for_import",
];

function normalizePlanAction(raw: string): "implement" | "cancel" | string {
  const lower = raw.trim().toLowerCase();
  if (IMPLEMENT_SYNONYMS.has(lower)) return "implement";
  if (CANCEL_SYNONYMS.has(lower)) return "cancel";
  return raw;
}

interface CreateHarnessOptions {
  toolClient: SingleAgentRuntimeInput["toolClient"];
  baseUrl: string;
  apiKey: string | undefined;
  modelId: string;
  availableModels?: string[];
  onDebug?: (info: Record<string, unknown>) => void;
  extraServerConfigs?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
}

// ─── Session-level harness singleton ─────────────────────────────────────────
// The harness is created once per process and reused across all turns so that
// Mastra's thread memory accumulates naturally without manual history management.

interface HarnessSingleton {
  harness: HarnessLike;
  baseUrl: string;
  apiKey: string | undefined;
  settingsPath: string;
}

let _singleton: HarnessSingleton | null = null;

/** Destroy and forget the current harness — call when starting a new chat session. */
export async function resetHarnessSingleton(): Promise<void> {
  if (!_singleton) return;
  try { await _singleton.harness.destroy?.(); } catch { /* best-effort */ }
  try { await rm(path.dirname(_singleton.settingsPath), { recursive: true, force: true }); } catch { /* best-effort */ }
  _singleton = null;
}

/** Create a brand-new harness and store it as the singleton. */
async function createFreshHarness(opts: CreateHarnessOptions): Promise<HarnessLike> {
  const mod = await dynamicImport("mastracode");
  const createMastraCode = mod.createMastraCode as (
    config?: Record<string, unknown>,
  ) => Promise<{ harness: HarnessLike }>;

  const serverConfig = opts.toolClient.getServerConfig();

  const harnessModelId = resolveHarnessModelId(opts.modelId, opts.availableModels);
  const settingsPath = await createManagedMastraSettings(opts, harnessModelId);
  const globalSettingsPath = await upsertGlobalMastraProvider(opts, harnessModelId);
  opts.onDebug?.({
    event: "mastra_9router_provider_configured",
    harnessModelId,
    baseUrl: opts.baseUrl,
    settingsPath,
    globalSettingsPath,
  });
  const { harness } = await createMastraCode({
    settingsPath,
    mcpServers: { codemap: serverConfig, ...opts.extraServerConfigs },
    // Disable orchestration/status tools that cause Mastra's build agent to loop:
    // get_agent_workflow / recommend_agent_workflow return instructions like
    // "call explore_task before broad tasks" — the agent follows them recursively.
    // Project/auth status tools can similarly pull a simple answer into setup work.
    disabledTools: MASTRA_DISABLED_TOOLS,
    initialState: {
      currentModelId: harnessModelId,
      permissionRules: { categories: {}, tools: {} },
    },
  });

  await harness.init();
  // Always create a fresh thread — selectOrCreateThread reuses old threads which
  // may have stale previous_response_id that causes 9router to abort immediately.
  await harness.createThread();
  await forceHarnessModel(harness, harnessModelId);

  _singleton = { harness, baseUrl: opts.baseUrl, apiKey: opts.apiKey, settingsPath };

  // Best-effort cleanup when the process exits.
  process.once("exit", () => { try { _singleton?.harness.destroy?.(); } catch { /* ignore */ } });

  return harness;
}

async function forceHarnessModel(harness: HarnessLike, modelId: string): Promise<void> {
  await harness.switchModel?.({ modelId, scope: "thread" });
  await harness.setState?.({ currentModelId: modelId });
}

async function getOrCreateHarness(opts: CreateHarnessOptions): Promise<HarnessLike> {
  const wanted = resolveHarnessModelId(opts.modelId, opts.availableModels);
  if (_singleton && _singleton.baseUrl === opts.baseUrl && _singleton.apiKey === opts.apiKey) {
    if (_singleton.harness.getCurrentModelId?.() !== wanted) {
      await forceHarnessModel(_singleton.harness, wanted);
    }
    return _singleton.harness;
  }

  // Gateway changed or first call — tear down and recreate.
  if (_singleton) {
    try { await _singleton.harness.destroy?.(); } catch { /* best-effort */ }
    _singleton = null;
  }
  return createFreshHarness(opts);
}

/**
 * Run a single-turn agent through the Mastra Harness.
 */
export async function runWithMastraHarness(
  input: SingleAgentRuntimeInput,
): Promise<AgentLoopResult> {
  const resolvedModel = resolveHarnessModelId(input.model, input.availableModels);
  const harness = await getOrCreateHarness({
    toolClient: input.toolClient,
    baseUrl: input.provider.baseUrl,
    apiKey: input.provider.apiKey,
    modelId: input.model,
    availableModels: input.availableModels,
    onDebug: input.onDebug,
    extraServerConfigs: input.toolClient.getExtraServerConfigs(),
  });

  const modelId = harness.getCurrentModelId?.();
  if (modelId) input.onModel?.(modelId);
  input.onDebug?.({
    event: "mastra_model_resolved",
    requested: input.model,
    resolved: resolvedModel,
    availableCount: input.availableModels?.length ?? 0,
  });

  const callbacks = {
    onToken: input.onToken,
    onStreamReset: input.onStreamReset,
    onToolStart: input.onToolStart,
    onToolResult: input.onToolResult,
    onUsage: input.onUsage,
    onDebug: input.onDebug,
  };

  const result = await runHarness(harness, input.userMessage, input.signal, input.confirmEdit, callbacks);
  if (!result.text.trim() && !result.usedTools && !input.signal?.aborted) {
    // Empty response with no tool calls usually means the singleton thread has
    // accumulated bad state (e.g. empty turns from previous failed runs). Reset
    // the singleton so the next turn starts with a clean harness and thread.
    input.onDebug?.({ event: "mastra_empty_response_reset_singleton", model: harness.getCurrentModelId?.() });
    await resetHarnessSingleton();
  }
  return result;
}

/**
 * Run the plan → approve → execute flow through the Mastra Harness.
 *
 * Uses mastracode's built-in "plan" mode (with submit_plan tool) and "build" mode.
 * Plan approval bridges via plan_approval_required → onPlanWait → respondToPlanApproval.
 */
export async function runMultiPhaseWithMastra(
  input: MultiPhaseLoopInput,
): Promise<AgentLoopResult> {
  const resolvedCoderModel = resolveHarnessModelId(input.coderModel, input.availableModels);
  const harness = await getOrCreateHarness({
    toolClient: input.toolClient,
    baseUrl: input.provider.baseUrl,
    apiKey: input.provider.apiKey,
    modelId: input.coderModel,
    availableModels: input.availableModels,
    onDebug: input.onDebug,
    extraServerConfigs: input.toolClient.getExtraServerConfigs(),
  });

  await harness.switchMode?.({ modeId: "plan" });
  await forceHarnessModel(harness, resolvedCoderModel);
  input.onDebug?.({
    event: "mastra_model_resolved",
    requested: input.coderModel,
    resolved: resolvedCoderModel,
    availableCount: input.availableModels?.length ?? 0,
  });

  return new Promise<AgentLoopResult>((resolve, reject) => {
    let finalText = "";
    let currentStreamText = "";
    let usedTools = false;
    let settled = false;

    const finish = (
      result: AgentLoopResult,
      unsubscribe: () => void,
      onAbort: () => void,
      timeoutId: ReturnType<typeof setTimeout>,
    ) => {
      if (settled) return;
      settled = true;
      input.onDebug?.({
        event: "mastra_run_finish",
        mode: "multi",
        textLength: result.text.length,
        usedTools: result.usedTools,
        unsupportedToolCalling: result.unsupportedToolCalling,
      });
      clearTimeout(timeoutId);
      input.signal?.removeEventListener("abort", onAbort);
      unsubscribe();
      resolve(result);
    };

    const fail = (
      err: unknown,
      unsubscribe: () => void,
      onAbort: () => void,
      timeoutId: ReturnType<typeof setTimeout>,
    ) => {
      if (settled) return;
      settled = true;
      input.onDebug?.({
        event: "mastra_run_fail",
        mode: "multi",
        error: err instanceof Error ? err.message : String(err),
      });
      clearTimeout(timeoutId);
      input.signal?.removeEventListener("abort", onAbort);
      unsubscribe();
      reject(err);
    };

    const handlePlanApproval = async (planId: string, plan: string) => {
      input.onPlanReady?.(plan);
      if (!input.onPlanWait) {
        await harness.respondToPlanApproval?.({ planId, response: { action: "approved" } });
        return;
      }
      const raw = await input.onPlanWait();
      const action = normalizePlanAction(raw);
      if (action === "cancel") {
        harness.abort?.();
        finish({
          text: "Plan cancelled.",
          messages: [],
          usedTools: false,
          unsupportedToolCalling: false,
        }, unsubscribe, onAbort, timeoutId);
        return;
      }
      if (action === "implement") {
        await harness.respondToPlanApproval?.({ planId, response: { action: "approved" } });
      } else {
        await harness.respondToPlanApproval?.({ planId, response: { action: "rejected", feedback: action } });
      }
    };

    let unsubscribe = () => {};
    let timeoutId: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      harness.abort?.();
      fail(createAbortError(), unsubscribe, onAbort, timeoutId);
    };

    timeoutId = setTimeout(() => {
      input.onDebug?.({
        event: "mastra_run_timeout",
        mode: "multi",
        finalTextLength: finalText.length,
        currentStreamTextLength: currentStreamText.length,
        usedTools,
      });
      harness.abort?.();
      finish({
        text: finalText || currentStreamText || "(agent timed out after 2 minutes)",
        messages: [input.userMessage],
        usedTools,
        unsupportedToolCalling: false,
      }, unsubscribe, onAbort, timeoutId);
    }, MASTRA_AGENT_TIMEOUT_MS);

    unsubscribe = harness.subscribe((event: HarnessEvent) => {
      input.onDebug?.(summarizeHarnessEvent(event, currentStreamText, finalText));
      if (event.type === "mode_changed") {
        const ev = event as HarnessEvent & { modeId?: string };
        const modelId = harness.getCurrentModelId?.() ?? "";
        if (ev.modeId === "plan") input.onPhaseStart?.("planning", modelId);
        else if (ev.modeId === "build") input.onPhaseStart?.("executing", modelId);
        return;
      }
      bridgeCommonEvent(event, {
        onToken: input.onToken,
        onStreamReset: input.onStreamReset,
        onToolStart: input.onToolStart,
        onToolResult: input.onToolResult,
        onUsage: input.onUsage,
        onDebug: input.onDebug,
        confirmEdit: input.confirmEdit,
        harness,
        currentStreamTextRef: { get: () => currentStreamText, set: (v) => { currentStreamText = v; } },
        finalTextRef: { get: () => finalText, set: (v) => { finalText = v; currentStreamText = ""; } },
        usedToolsRef: { get: () => usedTools, set: (v) => { usedTools = v; } },
        onPlanApproval: (planId, plan) => {
          handlePlanApproval(planId, plan).catch((err) => {
            fail(err, unsubscribe, onAbort, timeoutId);
          });
        },
        onEnd: (usage) => {
          finish({
            text: finalText || currentStreamText,
            messages: [input.userMessage],
            usedTools,
            unsupportedToolCalling: false,
            usage,
          }, unsubscribe, onAbort, timeoutId);
        },
        onError: (err) => fail(err, unsubscribe, onAbort, timeoutId),
      });
    });

    input.signal?.addEventListener("abort", onAbort, { once: true });

    sendHarnessInput(harness, input.userMessage.content, input.onDebug).catch((err: unknown) => {
      fail(err instanceof Error ? err : new Error(String(err)), unsubscribe, onAbort, timeoutId);
    });
  });
}

/** Drive the harness for a single-turn message and resolve when agent_end fires. */
function runHarness(
  harness: HarnessLike,
  userMessage: { role: string; content: string },
  signal: AbortSignal | undefined,
  confirmEdit: SingleAgentRuntimeInput["confirmEdit"],
  callbacks: Omit<BridgeCallbacks, "harness" | "currentStreamTextRef" | "finalTextRef" | "usedToolsRef" | "onEnd" | "onError" | "confirmEdit">,
): Promise<AgentLoopResult> {
  return new Promise<AgentLoopResult>((resolve, reject) => {
    let finalText = "";
    let currentStreamText = "";
    let usedTools = false;
    let settled = false;

    let timeoutId: ReturnType<typeof setTimeout>;
    const finish = (result: AgentLoopResult) => {
      if (settled) return;
      settled = true;
      callbacks.onDebug?.({
        event: "mastra_run_finish",
        mode: "single",
        textLength: result.text.length,
        usedTools: result.usedTools,
        unsupportedToolCalling: result.unsupportedToolCalling,
      });
      clearTimeout(timeoutId);
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
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      unsubscribe();
      reject(err);
    };

    const unsubscribe = harness.subscribe((event: HarnessEvent) => {
      callbacks.onDebug?.(summarizeHarnessEvent(event, currentStreamText, finalText));
      if (
        (event.type === "usage_update" || event.type === "om_status") &&
        currentStreamText.trim() &&
        !usedTools
      ) {
        callbacks.onDebug?.({
          event: "mastra_finish_on_quiet_usage",
          trigger: event.type,
          textLength: currentStreamText.length,
        });
        const raw = harness.getTokenUsage?.();
        const usage = raw
          ? {
              promptTokens: raw.promptTokens ?? 0,
              completionTokens: raw.completionTokens ?? 0,
              totalTokens: raw.totalTokens ?? 0,
            }
          : undefined;
        if (usage) callbacks.onUsage?.(usage);
        harness.abort?.();
        finish({
          text: finalText || currentStreamText,
          messages: [userMessage as { role: "user"; content: string }],
          usedTools,
          unsupportedToolCalling: false,
          usage,
        });
        return;
      }
      bridgeCommonEvent(event, {
        ...callbacks,
        confirmEdit,
        harness,
        currentStreamTextRef: { get: () => currentStreamText, set: (v) => { currentStreamText = v; } },
        finalTextRef: { get: () => finalText, set: (v) => { finalText = v; } },
        usedToolsRef: { get: () => usedTools, set: (v) => { usedTools = v; } },
        onEnd: (usage) => {
          finish({
            text: finalText || currentStreamText,
            messages: [userMessage as { role: "user"; content: string }],
            usedTools,
            unsupportedToolCalling: false,
            usage,
          });
        },
        onError: fail,
      });
    });

    const onAbort = () => { harness.abort?.(); fail(createAbortError()); };
    signal?.addEventListener("abort", onAbort, { once: true });

    // Safety timeout: if agent_end never fires (agent stuck in a tool loop),
    // abort and return whatever text we've accumulated so far.
    timeoutId = setTimeout(() => {
      callbacks.onDebug?.({
        event: "mastra_run_timeout",
        mode: "single",
        finalTextLength: finalText.length,
        currentStreamTextLength: currentStreamText.length,
        usedTools,
      });
      harness.abort?.();
      finish({
        text: finalText || currentStreamText || "(agent timed out after 2 minutes)",
        messages: [userMessage as { role: "user"; content: string }],
        usedTools,
        unsupportedToolCalling: false,
      });
    }, MASTRA_AGENT_TIMEOUT_MS);

    sendHarnessInput(harness, userMessage.content, callbacks.onDebug).catch((err: unknown) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

async function sendHarnessInput(
  harness: HarnessLike,
  content: string,
  onDebug?: (info: Record<string, unknown>) => void,
): Promise<void> {
  onDebug?.({ event: "mastra_send_message_start", contentLength: content.length });
  if (harness.sendSignal) {
    const signal = harness.sendSignal({ content });
    onDebug?.({ event: "mastra_send_signal_created", signalId: signal.id, signalType: signal.type });
    await signal.accepted;
    onDebug?.({ event: "mastra_send_signal_accepted", signalId: signal.id });
    return;
  }
  await harness.sendMessage({ content });
  onDebug?.({ event: "mastra_send_message_done" });
}

function createAbortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}
