import { rm } from "node:fs/promises";
import path from "node:path";
import type { AgentLoopResult } from "../agent/agent-loop.js";
import type {
  SingleAgentRuntimeInput,
  MultiPhaseLoopInput,
} from "./cli-runtime.js";
import {
  bridgeCommonEvent,
  type BridgeCallbacks,
  type HarnessEvent,
  type HarnessLike,
  summarizeHarnessEvent,
} from "./mastra-events.js";
import {
  resolveHarnessModelId,
  stripNineRouterPrefix,
} from "./mastra-models.js";
import {
  createManagedMastraSettings,
  upsertGlobalMastraProvider,
} from "./mastra-settings.js";
import { buildMastraPermissionRules } from "./tool-approval-policy.js";

type DynamicImport = (specifier: string) => Promise<Record<string, unknown>>;

export interface MastraMcpServerStatus {
  name: string;
  connected: boolean;
  connecting?: boolean;
  toolCount: number;
  toolNames: string[];
  transport: "stdio" | "http";
  error?: string;
}

export interface MastraMcpSkippedServer {
  name: string;
  reason: string;
}

export interface MastraMcpConfigPaths {
  project: string;
  global: string;
  claude: string;
}

export interface MastraMcpStatusSummary {
  hasServers: boolean;
  statuses: MastraMcpServerStatus[];
  skipped: MastraMcpSkippedServer[];
  configPaths?: MastraMcpConfigPaths;
}

interface MastraMcpInitResult {
  connected: MastraMcpServerStatus[];
  failed: MastraMcpServerStatus[];
  skipped: MastraMcpSkippedServer[];
  totalTools: number;
}

interface MastraMcpManagerLike {
  initInBackground(): Promise<MastraMcpInitResult>;
  hasServers(): boolean;
  getServerStatuses(): MastraMcpServerStatus[];
  getSkippedServers(): MastraMcpSkippedServer[];
  getConfigPaths?(): MastraMcpConfigPaths;
}

const dynamicImport = new Function(
  "specifier",
  "return import(specifier)",
) as DynamicImport;

const IMPLEMENT_SYNONYMS = new Set([
  "implement",
  "ok",
  "okay",
  "yes",
  "y",
  "go",
  "proceed",
  "sure",
  "do it",
  "ừ",
  "ừm",
  "đồng ý",
  "được",
  "làm đi",
  "làm luôn",
  "tiếp tục",
  "ok luôn",
]);
const CANCEL_SYNONYMS = new Set([
  "cancel",
  "no",
  "n",
  "stop",
  "abort",
  "quit",
  "exit",
  "không",
  "thôi",
  "dừng",
  "hủy",
]);

const MASTRA_DISABLED_TOOLS = [
  // Mastra-internal approval tool, not a CodeMap MCP tool. CodeMap handles
  // tool approval in the UI layer, so keep this unavailable to the agent.
  "request_access",
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
  extraServerConfigs?: Record<
    string,
    { command: string; args?: string[]; env?: Record<string, string> }
  >;
}

// ─── Session-level harness singleton ─────────────────────────────────────────
// The harness is created once per process and reused across all turns so that
// Mastra's thread memory accumulates naturally without manual history management.

interface HarnessSingleton {
  harness: HarnessLike;
  mcpManager: MastraMcpManagerLike | undefined;
  mcpInitPromise: Promise<MastraMcpInitResult> | undefined;
  baseUrl: string;
  apiKey: string | undefined;
  settingsPath: string;
  mcpServerIds: Set<string>;
}

let _singleton: HarnessSingleton | null = null;
const ORIGINAL_AGENT_INSTRUCTIONS = new WeakMap<
  object,
  (options?: { requestContext?: unknown }) => unknown
>();
const APPLIED_AGENT_INSTRUCTIONS = new WeakMap<object, string>();

// ─── Drain tracking ───────────────────────────────────────────────────────────
// Tracks when the current harness run has fully settled (agent_end / error).
// A persistent subscription (separate from the per-run subscription) observes
// the event stream so we can await idle even after a run's own subscription is
// torn down by abort.

let _drainResolve: (() => void) | null = null;
let _drainPromise: Promise<void> | null = null;
let _drainUnsubscribe: (() => void) | null = null;

function startDrainTracking(harness: HarnessLike): void {
  _drainUnsubscribe?.();
  let resolve!: () => void;
  _drainPromise = new Promise<void>((r) => {
    resolve = r;
  });
  _drainResolve = resolve;
  _drainUnsubscribe = harness.subscribe((event: HarnessEvent) => {
    if (event.type === "agent_end" || event.type === "error") {
      _drainUnsubscribe?.();
      _drainUnsubscribe = null;
      _drainResolve?.();
      _drainResolve = null;
      _drainPromise = null;
    }
  });
}

function clearDrainTracking(): void {
  _drainUnsubscribe?.();
  _drainUnsubscribe = null;
  _drainResolve?.();
  _drainResolve = null;
  _drainPromise = null;
}

/** Wait for the previous harness run to emit agent_end / error before proceeding. */
export async function drainHarness(timeoutMs = 5000): Promise<void> {
  if (!_drainPromise) return;
  await Promise.race([
    _drainPromise,
    new Promise<void>((r) => setTimeout(r, timeoutMs)),
  ]);
}

/** Destroy and forget the current harness — call when starting a new chat session. */
export async function resetHarnessSingleton(): Promise<void> {
  if (!_singleton) return;
  clearDrainTracking();
  const old = _singleton;
  _singleton = null;
  try {
    await old.harness.destroy?.();
  } catch {
    /* best-effort */
  }
  try {
    await rm(path.dirname(old.settingsPath), { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

/** Create a brand-new harness and store it as the singleton. */
async function createFreshHarness(
  opts: CreateHarnessOptions,
): Promise<HarnessLike> {
  const mod = await dynamicImport("mastracode");
  const createMastraCode = mod.createMastraCode as (
    config?: Record<string, unknown>,
  ) => Promise<{ harness: HarnessLike; mcpManager?: MastraMcpManagerLike }>;

  const serverConfig = opts.toolClient.getServerConfig();

  const harnessModelId = resolveHarnessModelId(
    opts.modelId,
    opts.availableModels,
  );
  const settingsPath = await createManagedMastraSettings(opts, harnessModelId);
  const globalSettingsPath = await upsertGlobalMastraProvider(
    opts,
    harnessModelId,
  );
  opts.onDebug?.({
    event: "mastra_9router_provider_configured",
    harnessModelId,
    baseUrl: opts.baseUrl,
    settingsPath,
    globalSettingsPath,
  });
  const mcpServerIds = new Set([
    "codemap",
    ...Object.keys(opts.extraServerConfigs ?? {}),
  ]);
  const { harness, mcpManager } = await createMastraCode({
    settingsPath,
    mcpServers: { codemap: serverConfig, ...opts.extraServerConfigs },
    // Disable orchestration/status tools that cause Mastra's build agent to loop:
    // get_agent_workflow / recommend_agent_workflow return instructions like
    // "call explore_task before broad tasks" — the agent follows them recursively.
    // Project/auth status tools can similarly pull a simple answer into setup work.
    disabledTools: MASTRA_DISABLED_TOOLS,
    initialState: {
      currentModelId: harnessModelId,
      permissionRules: buildMastraPermissionRules(mcpServerIds),
      // Bypass Mastra's suspend/resume approval cycle — all tool-call-approval
      // chunks resolve as "allow" immediately, avoiding the runId deduplication
      // bug in subscribeToThread that causes tool_end to never fire.
      // Per-tool approval is handled at the UI layer via tool_start events.
      yolo: true,
      // Use the same 9router model for OM observation/reflection instead of the
      // default google/gemini-2.5-flash which requires a separate API key.
      observerModelId: harnessModelId,
      reflectorModelId: harnessModelId,
    },
  });

  await harness.init();
  // Always create a fresh thread — selectOrCreateThread reuses old threads which
  // may have stale previous_response_id that causes 9router to abort immediately.
  await harness.createThread();
  await forceHarnessModel(harness, harnessModelId);

  const mcpInitPromise = startMastraMcpInitialization(mcpManager, opts.onDebug);

  _singleton = {
    harness,
    mcpManager,
    mcpInitPromise,
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    settingsPath,
    mcpServerIds,
  };

  // Best-effort cleanup when the process exits.
  process.once("exit", () => {
    try {
      _singleton?.harness.destroy?.();
    } catch {
      /* ignore */
    }
  });

  return harness;
}

function startMastraMcpInitialization(
  mcpManager: MastraMcpManagerLike | undefined,
  onDebug?: (info: Record<string, unknown>) => void,
): Promise<MastraMcpInitResult> | undefined {
  if (!mcpManager?.hasServers()) return undefined;

  onDebug?.({ event: "mastra_mcp_init_start" });
  return mcpManager
    .initInBackground()
    .then((result) => {
      onDebug?.({
        event: "mastra_mcp_init_done",
        connectedCount: result.connected.length,
        failedCount: result.failed.length,
        skippedCount: result.skipped.length,
        totalTools: result.totalTools,
      });
      return result;
    })
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      onDebug?.({ event: "mastra_mcp_init_failed", error });
      return {
        connected: [],
        failed: mcpManager.getServerStatuses(),
        skipped: mcpManager.getSkippedServers(),
        totalTools: 0,
      };
    });
}

async function forceHarnessModel(
  harness: HarnessLike,
  modelId: string,
): Promise<void> {
  await harness.switchModel?.({ modelId, scope: "thread" });
  await harness.setState?.({ currentModelId: modelId });
}

function stringifyInstructions(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(stringifyInstructions).filter(Boolean).join("\n\n");
  }
  if (typeof value === "object") {
    const content = (value as { content?: unknown }).content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return stringifyInstructions(content);
  }
  return String(value);
}

async function resolveAgentInstructions(
  instructions: unknown,
  options?: { requestContext?: unknown },
): Promise<unknown> {
  if (typeof instructions === "function") {
    return (
      instructions as (options?: { requestContext?: unknown }) => unknown
    )(options);
  }
  return instructions;
}

function getModeAgents(harness: HarnessLike): object[] {
  const maybeHarness = harness as HarnessLike & {
    listModes?: () => Array<{ agent?: unknown }>;
    getState?: () => unknown;
  };
  const state = maybeHarness.getState?.();
  const agents: object[] = [];
  for (const mode of maybeHarness.listModes?.() ?? []) {
    const rawAgent =
      typeof mode.agent === "function"
        ? (mode.agent as (state: unknown) => unknown)(state)
        : mode.agent;
    if (rawAgent && typeof rawAgent === "object") agents.push(rawAgent);
  }
  return [...new Set(agents)];
}

function applyAgentInstructions(
  harness: HarnessLike,
  instructions?: string,
): void {
  if (!instructions?.trim()) return;

  for (const agent of getModeAgents(harness)) {
    const writableAgent = agent as {
      __getOverridableFields?: () => { instructions?: unknown };
      __updateInstructions?: (instructions: unknown) => void;
    };
    if (!writableAgent.__updateInstructions) continue;
    if (APPLIED_AGENT_INSTRUCTIONS.get(agent) === instructions) continue;

    const originalInstructions =
      writableAgent.__getOverridableFields?.().instructions;
    const original =
      ORIGINAL_AGENT_INSTRUCTIONS.get(agent) ??
      ((options?: { requestContext?: unknown }) =>
        resolveAgentInstructions(originalInstructions, options));
    if (!original) continue;
    ORIGINAL_AGENT_INSTRUCTIONS.set(agent, original);
    APPLIED_AGENT_INSTRUCTIONS.set(agent, instructions);

    writableAgent.__updateInstructions(
      async (options?: { requestContext?: unknown }) => {
        const base = stringifyInstructions(await original(options));
        return [
          instructions,
          "# CodeMap Instruction Priority",
          "The CodeMap identity and instructions above override any internal runtime/product names in the base prompt below.",
          base,
        ]
          .filter(Boolean)
          .join("\n\n---\n\n");
      },
    );
  }
}

async function getOrCreateHarness(
  opts: CreateHarnessOptions,
): Promise<HarnessLike> {
  const wanted = resolveHarnessModelId(opts.modelId, opts.availableModels);
  if (
    _singleton &&
    _singleton.baseUrl === opts.baseUrl &&
    _singleton.apiKey === opts.apiKey
  ) {
    if (_singleton.harness.getCurrentModelId?.() !== wanted) {
      await forceHarnessModel(_singleton.harness, wanted);
    }
    return _singleton.harness;
  }

  // Gateway changed or first call — tear down and recreate.
  if (_singleton) {
    try {
      await _singleton.harness.destroy?.();
    } catch {
      /* best-effort */
    }
    _singleton = null;
  }
  return createFreshHarness(opts);
}

/** Pre-initialize the harness singleton in the background so the first chat turn has no cold-start delay. */
export function warmupHarness(opts: CreateHarnessOptions): Promise<void> {
  return getOrCreateHarness(opts).then(() => {});
}

/**
 * Run a single-turn agent through the Mastra Harness.
 */
export async function runWithMastraHarness(
  input: SingleAgentRuntimeInput,
): Promise<AgentLoopResult> {
  await drainHarness();
  const resolvedModel = resolveHarnessModelId(
    input.model,
    input.availableModels,
  );
  const harness = await getOrCreateHarness({
    toolClient: input.toolClient,
    baseUrl: input.provider.baseUrl,
    apiKey: input.provider.apiKey,
    modelId: input.model,
    availableModels: input.availableModels,
    onDebug: input.onDebug,
    extraServerConfigs: input.toolClient.getExtraServerConfigs(),
  });
  startDrainTracking(harness);

  const modelId = harness.getCurrentModelId?.();
  if (modelId) input.onModel?.(modelId);
  input.onDebug?.({
    event: "mastra_model_resolved",
    requested: input.model,
    resolved: resolvedModel,
    availableCount: input.availableModels?.length ?? 0,
  });
  applyAgentInstructions(harness, input.agentInstructions);

  const callbacks = {
    onToken: input.onToken,
    onStreamReset: input.onStreamReset,
    onToolStart: input.onToolStart,
    onToolResult: input.onToolResult,
    onUsage: input.onUsage,
    onDebug: input.onDebug,
    onOMObservation: input.onOMObservation,
    onOMReflection: input.onOMReflection,
    mcpServerIds: _singleton?.mcpServerIds,
  };

  const result = await runHarness(
    harness,
    input.userMessage,
    input.signal,
    callbacks,
    input.imageFiles,
  );
  if (!result.text.trim() && !result.usedTools && !input.signal?.aborted) {
    // Empty response with no tool calls usually means the singleton thread has
    // accumulated bad state (e.g. empty turns from previous failed runs). Reset
    // the singleton so the next turn starts with a clean harness and thread.
    input.onDebug?.({
      event: "mastra_empty_response_reset_singleton",
      model: harness.getCurrentModelId?.(),
    });
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
  await drainHarness();
  const resolvedCoderModel = resolveHarnessModelId(
    input.coderModel,
    input.availableModels,
  );
  const harness = await getOrCreateHarness({
    toolClient: input.toolClient,
    baseUrl: input.provider.baseUrl,
    apiKey: input.provider.apiKey,
    modelId: input.coderModel,
    availableModels: input.availableModels,
    onDebug: input.onDebug,
    extraServerConfigs: input.toolClient.getExtraServerConfigs(),
  });
  startDrainTracking(harness);

  await harness.switchMode?.({ modeId: "plan" });
  await forceHarnessModel(harness, resolvedCoderModel);
  applyAgentInstructions(harness, input.agentInstructions);
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

    let unsubscribe = () => {};

    const finish = (result: AgentLoopResult) => {
      if (settled) return;
      settled = true;
      input.onDebug?.({
        event: "mastra_run_finish",
        mode: "multi",
        textLength: result.text.length,
        usedTools: result.usedTools,
        unsupportedToolCalling: result.unsupportedToolCalling,
      });
      input.signal?.removeEventListener("abort", onAbort);
      unsubscribe();
      resolve(result);
    };

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      input.onDebug?.({
        event: "mastra_run_fail",
        mode: "multi",
        error: err instanceof Error ? err.message : String(err),
      });
      input.signal?.removeEventListener("abort", onAbort);
      unsubscribe();
      reject(err);
    };

    const handlePlanApproval = async (planId: string, plan: string) => {
      input.onPlanReady?.(plan);
      if (!input.onPlanWait) {
        await harness.respondToPlanApproval?.({
          planId,
          response: { action: "approved" },
        });
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
        });
        return;
      }
      if (action === "implement") {
        await harness.respondToPlanApproval?.({
          planId,
          response: { action: "approved" },
        });
      } else {
        await harness.respondToPlanApproval?.({
          planId,
          response: { action: "rejected", feedback: action },
        });
      }
    };

    const onAbort = () => {
      harness.abort?.();
      fail(createAbortError());
    };

    unsubscribe = harness.subscribe((event: HarnessEvent) => {
      input.onDebug?.(
        summarizeHarnessEvent(event, currentStreamText, finalText),
      );
      if (event.type === "mode_changed") {
        const ev = event as HarnessEvent & { modeId?: string };
        const modelId = harness.getCurrentModelId?.() ?? "";
        if (ev.modeId === "plan") input.onPhaseStart?.("planning", modelId);
        else if (ev.modeId === "build")
          input.onPhaseStart?.("executing", modelId);
        return;
      }
      bridgeCommonEvent(event, {
        onToken: input.onToken,
        onStreamReset: input.onStreamReset,
        onToolStart: input.onToolStart,
        onToolResult: input.onToolResult,
        onUsage: input.onUsage,
        onDebug: input.onDebug,
        onOMObservation: input.onOMObservation,
        onOMReflection: input.onOMReflection,
        harness,
        currentStreamTextRef: {
          get: () => currentStreamText,
          set: (v) => {
            currentStreamText = v;
          },
        },
        finalTextRef: {
          get: () => finalText,
          set: (v) => {
            finalText = v;
            currentStreamText = "";
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
        mcpServerIds: _singleton?.mcpServerIds,
        onEnd: (usage) => {
          finish({
            text: finalText || currentStreamText,
            messages: [input.userMessage],
            usedTools,
            unsupportedToolCalling: false,
            usage,
          });
        },
        onError: fail,
      });
    });

    input.signal?.addEventListener("abort", onAbort, { once: true });

    sendHarnessInput(
      harness,
      input.userMessage.content,
      input.imageFiles,
      input.onDebug,
    ).catch((err: unknown) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

/** Drive the harness for a single-turn message and resolve when agent_end fires. */
function runHarness(
  harness: HarnessLike,
  userMessage: { role: string; content: string },
  signal: AbortSignal | undefined,
  callbacks: Omit<
    BridgeCallbacks,
    | "harness"
    | "currentStreamTextRef"
    | "finalTextRef"
    | "usedToolsRef"
    | "onEnd"
    | "onError"
  >,
  imageFiles?: Array<{ data: string; mimeType: string }>,
): Promise<AgentLoopResult> {
  return new Promise<AgentLoopResult>((resolve, reject) => {
    let finalText = "";
    let currentStreamText = "";
    let usedTools = false;
    let settled = false;

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

    const unsubscribe = harness.subscribe((event: HarnessEvent) => {
      callbacks.onDebug?.(
        summarizeHarnessEvent(event, currentStreamText, finalText),
      );
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
        harness,
        currentStreamTextRef: {
          get: () => currentStreamText,
          set: (v) => {
            currentStreamText = v;
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
      if (event.type === "message_end" && finalText.trim()) {
        callbacks.onDebug?.({
          event: "mastra_finish_on_message_end",
          textLength: finalText.length,
          usedTools,
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
        finish({
          text: finalText,
          messages: [userMessage as { role: "user"; content: string }],
          usedTools,
          unsupportedToolCalling: false,
          usage,
        });
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
  harness: HarnessLike,
  content: string,
  imageFiles: Array<{ data: string; mimeType: string }> | undefined,
  onDebug?: (info: Record<string, unknown>) => void,
): Promise<void> {
  onDebug?.({
    event: "mastra_send_message_start",
    contentLength: content.length,
    imageCount: imageFiles?.length ?? 0,
  });
  if (harness.sendSignal) {
    const signalContent = imageFiles?.length
      ? {
          role: "user",
          content: [
            { type: "text", text: content },
            ...imageFiles.map((f) => ({
              type: "file",
              data: f.data,
              mediaType: f.mimeType,
            })),
          ],
        }
      : content;
    const signal = harness.sendSignal({ content: signalContent as string });
    onDebug?.({
      event: "mastra_send_signal_created",
      signalId: signal.id,
      signalType: signal.type,
    });
    await signal.accepted;
    onDebug?.({ event: "mastra_send_signal_accepted", signalId: signal.id });
    return;
  }
  const files = imageFiles?.map((f) => ({
    data: f.data,
    mediaType: f.mimeType,
  }));
  await harness.sendMessage({ content, files });
  onDebug?.({ event: "mastra_send_message_done" });
}

function createAbortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

export function getMastraCurrentModelId(): string | null {
  if (!_singleton) return null;
  const raw = _singleton.harness.getCurrentModelId?.() ?? null;
  return raw ? stripNineRouterPrefix(raw) : null;
}

export function getMastraThreadId(): string | null {
  return _singleton?.harness.getCurrentThreadId?.() ?? null;
}

export function getMastraMcpServerStatuses(): MastraMcpServerStatus[] | null {
  return _singleton?.mcpManager?.getServerStatuses() ?? null;
}

export async function getMastraMcpStatusSummary(): Promise<MastraMcpStatusSummary | null> {
  const manager = _singleton?.mcpManager;
  if (!manager) return null;

  await _singleton?.mcpInitPromise;

  return {
    hasServers: manager.hasServers(),
    statuses: manager.getServerStatuses(),
    skipped: manager.getSkippedServers(),
    configPaths: manager.getConfigPaths?.(),
  };
}

export async function getMastraThreadTokenUsage(): Promise<{
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} | null> {
  if (!_singleton) return null;
  try {
    const threadId = _singleton.harness.getCurrentThreadId?.();
    if (!threadId) return null;
    const threads = await _singleton.harness.listThreads();
    const thread = threads.find((t) => t.id === threadId);
    const u = thread?.tokenUsage;
    if (!u) return null;
    return {
      promptTokens:
        (u as unknown as { promptTokens?: number }).promptTokens ?? 0,
      completionTokens:
        (u as unknown as { completionTokens?: number }).completionTokens ?? 0,
      totalTokens: u.totalTokens ?? 0,
    };
  } catch {
    return null;
  }
}

export async function getMastraMessages(
  limit?: number,
): Promise<import("./mastra-events.js").HarnessMessage[]> {
  if (!_singleton) return [];
  try {
    return await _singleton.harness.listMessages({ limit });
  } catch {
    return [];
  }
}

export async function listMastraThreads(): Promise<
  import("./mastra-events.js").HarnessThread[]
> {
  if (!_singleton) return [];
  try {
    return await _singleton.harness.listThreads();
  } catch {
    return [];
  }
}

export async function listMastraThreadMessages(
  threadId: string,
  limit?: number,
): Promise<import("./mastra-events.js").HarnessMessage[]> {
  if (!_singleton) return [];
  try {
    return await _singleton.harness.listMessagesForThread({ threadId, limit });
  } catch {
    return [];
  }
}

export async function switchMastraThread(threadId: string): Promise<void> {
  if (!_singleton) return;
  await _singleton.harness.switchThread({ threadId });
}

export function getMastraOMStatus(): {
  observationTokens: number;
  status: string;
} | null {
  if (!_singleton) return null;
  try {
    const ds = _singleton.harness.getDisplayState?.();
    if (!ds?.omProgress) return null;
    return {
      observationTokens: ds.omProgress.observationTokens ?? 0,
      status: ds.omProgress.status ?? "idle",
    };
  } catch {
    return null;
  }
}
