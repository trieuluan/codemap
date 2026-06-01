import { rm } from "node:fs/promises";
import path from "node:path";
import type { AgentLoopResult } from "../core/agent-loop.js";
import type { SingleAgentRuntimeInput } from "./types.js";
import type { HarnessLike } from "./events.js";
import { clearDrainTracking, drainHarness, startDrainTracking } from "./harness/drain.js";
import {
  installTemperatureInterceptor,
  setCurrentEffort,
  uninstallFetchInterceptor,
} from "./harness/fetch-interceptor.js";
import { applyAgentInstructions } from "./harness/instructions.js";
import {
  MASTRA_DISABLED_TOOLS,
  type MastraMcpInitResult,
  type MastraMcpManagerLike,
  type MastraMcpServerStatus,
  type MastraMcpStatusSummary,
  startMastraMcpInitialization,
} from "./mcp/index.js";
import { resolveHarnessModelId, stripNineRouterPrefix } from "./config/models.js";
import { runHarness } from "./harness/harness-runner.js";
import {
  createManagedMastraSettings,
  upsertGlobalMastraProvider,
} from "./config/settings.js";
import { buildMastraPermissionRules } from "./config/tool-approval-policy.js";

export type {
  MastraMcpConfigPaths,
  MastraMcpServerStatus,
  MastraMcpSkippedServer,
  MastraMcpStatusSummary,
} from "./mcp/index.js";

export { MASTRA_DISABLED_TOOLS, drainHarness };

type DynamicImport = (specifier: string) => Promise<Record<string, unknown>>;

interface CreateHarnessOptions {
  toolClient: SingleAgentRuntimeInput["toolClient"];
  baseUrl: string;
  apiKey: string | undefined;
  modelId: string;
  availableModels?: string[];
  availableCombos?: string[];
  onDebug?: (info: Record<string, unknown>) => void;
  extraServerConfigs?: Record<
    string,
    { command: string; args?: string[]; env?: Record<string, string> }
  >;
  /** Mastra tool definitions from CodeMapMcpToolClient — when provided, skips spawning a separate codemap MCP child process. */
  mastraTools?: Record<string, unknown>;
}

interface HarnessSingleton {
  harness: HarnessLike;
  mcpManager: MastraMcpManagerLike | undefined;
  mcpInitPromise: Promise<MastraMcpInitResult> | undefined;
  baseUrl: string;
  apiKey: string | undefined;
  settingsPath: string;
  mcpServerIds: Set<string>;
}

const dynamicImport = new Function(
  "specifier",
  "return import(specifier)",
) as DynamicImport;

let singleton: HarnessSingleton | null = null;

async function forceHarnessModel(
  harness: HarnessLike,
  modelId: string,
): Promise<void> {
  await harness.switchModel?.({ modelId, scope: "thread" });
  await harness.setState?.({ currentModelId: modelId });
}

async function getOrCreateHarness(
  opts: CreateHarnessOptions,
): Promise<HarnessLike> {
  const wanted = resolveHarnessModelId(
    opts.modelId,
    opts.availableModels,
    opts.availableCombos,
  );
  if (
    singleton &&
    singleton.baseUrl === opts.baseUrl &&
    singleton.apiKey === opts.apiKey
  ) {
    if (singleton.harness.getCurrentModelId?.() !== wanted) {
      await forceHarnessModel(singleton.harness, wanted);
    }
    return singleton.harness;
  }

  if (singleton) {
    try {
      await singleton.harness.destroy?.();
    } catch {
      /* best-effort */
    }
    singleton = null;
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
  setCurrentEffort(input.effort ?? null);
  await drainHarness();
  const resolvedModel = resolveHarnessModelId(
    input.model,
    input.availableModels,
    input.availableCombos,
  );
  const harness = await getOrCreateHarness({
    toolClient: input.toolClient,
    baseUrl: input.provider.baseUrl,
    apiKey: input.provider.apiKey,
    modelId: input.model,
    availableModels: input.availableModels,
    availableCombos: input.availableCombos,
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

  if (input.planMode) {
    await harness.switchMode?.({ modeId: "plan" });
  }

  const callbacks = {
    onToken: input.onToken,
    onStreamReset: input.onStreamReset,
    onToolStart: input.onToolStart,
    onToolResult: input.onToolResult,
    onMessageStart: input.onMessageStart,
    onUsage: input.onUsage,
    onDebug: input.onDebug,
    onPlanReady: input.onPlanReady,
    onPlanWait: input.onPlanWait,
    onPhaseStart: input.onPhaseStart,
    onOMObservation: input.onOMObservation,
    onOMReflection: input.onOMReflection,
    onAskQuestion: input.onAskQuestion,
    mcpServerIds: singleton?.mcpServerIds,
  };

  let result: AgentLoopResult;
  try {
    result = await runHarness(
      harness,
      input.userMessage,
      input.signal,
      callbacks,
      input.imageFiles,
    );
  } finally {
    setCurrentEffort(null);
  }
  if (!result.text.trim() && !input.signal?.aborted) {
    input.onDebug?.({
      event: "mastra_empty_response_reset_singleton",
      model: harness.getCurrentModelId?.(),
    });
    await resetHarnessSingleton();
  }
  return result;
}

/** Destroy and forget the current harness — call when starting a new chat session. */
export async function resetHarnessSingleton(): Promise<void> {
  if (!singleton) return;
  clearDrainTracking();
  uninstallFetchInterceptor();
  const old = singleton;
  singleton = null;
  try {
    await old.mcpManager?.disconnect?.();
  } catch {
    /* best-effort */
  }
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

  installTemperatureInterceptor(opts.baseUrl);

  const harnessModelId = resolveHarnessModelId(
    opts.modelId,
    opts.availableModels,
    opts.availableCombos,
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

  const extraServerKeys = Object.keys(opts.extraServerConfigs ?? {});
  const baseMcpServers = opts.mastraTools
    ? extraServerKeys.length > 0
      ? opts.extraServerConfigs
      : undefined
    : { codemap: serverConfig, ...opts.extraServerConfigs };
  const filteredMastraTools = opts.mastraTools ?? undefined;

  const mcpServerIds = new Set(["codemap", ...extraServerKeys]);
  const { harness, mcpManager } = await createMastraCode({
    settingsPath,
    ...(baseMcpServers && Object.keys(baseMcpServers).length > 0
      ? { mcpServers: baseMcpServers }
      : {}),
    ...(filteredMastraTools ? { extraTools: filteredMastraTools } : {}),
    disabledTools: MASTRA_DISABLED_TOOLS,
    initialState: {
      currentModelId: harnessModelId,
      permissionRules: buildMastraPermissionRules(mcpServerIds),
      yolo: true,
      observerModelId: harnessModelId,
      reflectorModelId: harnessModelId,
    },
  });

  await harness.init();
  await harness.createThread();
  await forceHarnessModel(harness, harnessModelId);

  const mcpInitPromise = startMastraMcpInitialization(mcpManager, opts.onDebug);

  singleton = {
    harness,
    mcpManager,
    mcpInitPromise,
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    settingsPath,
    mcpServerIds,
  };

  process.once("exit", () => {
    uninstallFetchInterceptor();
    try {
      singleton?.harness.destroy?.();
    } catch {
      /* ignore */
    }
  });

  return harness;
}

export function getMastraCurrentModelId(): string | null {
  if (!singleton) return null;
  const raw = singleton.harness.getCurrentModelId?.() ?? null;
  return raw ? stripNineRouterPrefix(raw) : null;
}

export function getMastraThreadId(): string | null {
  return singleton?.harness.getCurrentThreadId?.() ?? null;
}

export function getMastraMcpServerStatuses(): MastraMcpServerStatus[] | null {
  return singleton?.mcpManager?.getServerStatuses() ?? null;
}

export async function getMastraMcpStatusSummary(): Promise<MastraMcpStatusSummary | null> {
  const manager = singleton?.mcpManager;
  if (!manager) return null;

  await singleton?.mcpInitPromise;

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
  if (!singleton) return null;
  try {
    const threadId = singleton.harness.getCurrentThreadId?.();
    if (!threadId) return null;

    const harnessUsage = singleton.harness.getTokenUsage?.();
    if (
      harnessUsage &&
      ((harnessUsage.promptTokens ?? 0) > 0 ||
        (harnessUsage.completionTokens ?? 0) > 0 ||
        (harnessUsage.totalTokens ?? 0) > 0)
    ) {
      return {
        promptTokens: harnessUsage.promptTokens ?? 0,
        completionTokens: harnessUsage.completionTokens ?? 0,
        totalTokens: harnessUsage.totalTokens ?? 0,
      };
    }

    const threads = await singleton.harness.listThreads();
    const thread = threads.find((t) => t.id === threadId);
    const u = thread?.tokenUsage;
    if (!u || (u.totalTokens ?? 0) <= 0) return null;
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: u.totalTokens ?? 0,
    };
  } catch {
    return null;
  }
}

export async function getMastraMessages(
  limit?: number,
): Promise<import("./events.js").HarnessMessage[]> {
  if (!singleton) return [];
  try {
    return await singleton.harness.listMessages({ limit });
  } catch {
    return [];
  }
}

export async function listMastraThreads(): Promise<
  import("./events.js").HarnessThread[]
> {
  if (!singleton) return [];
  try {
    return await singleton.harness.listThreads();
  } catch {
    return [];
  }
}

export async function listMastraThreadMessages(
  threadId: string,
  limit?: number,
): Promise<import("./events.js").HarnessMessage[]> {
  if (!singleton) return [];
  try {
    return await singleton.harness.listMessagesForThread({ threadId, limit });
  } catch {
    return [];
  }
}

export async function switchMastraThread(threadId: string): Promise<boolean> {
  if (!singleton) return false;
  try {
    await singleton.harness.switchThread({ threadId });
    return true;
  } catch {
    return false;
  }
}

export function getMastraOMStatus(): {
  observationTokens: number;
  status: string;
} | null {
  if (!singleton) return null;
  try {
    const ds = singleton.harness.getDisplayState?.();
    if (!ds?.omProgress) return null;
    return {
      observationTokens: ds.omProgress.observationTokens ?? 0,
      status: ds.omProgress.status ?? "idle",
    };
  } catch {
    return null;
  }
}
