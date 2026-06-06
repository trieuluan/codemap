import type { AgentLoopResult } from "../core/agent-loop.js";
import type { GatewayProviderId } from "../types.js";
import type { SingleAgentRuntimeInput } from "./types.js";
import type { MastraHarness, HarnessMessage, HarnessThread } from "./events.js";
import {
  clearDrainTracking,
  drainHarness,
  startDrainTracking,
} from "./harness/drain.js";
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
import { resolveHarnessModelId, stripProviderPrefix } from "./config/models.js";
import { loadCustomTools, getCustomToolPaths } from "../tools/custom/index.js";
import { syncHooksToMastra } from "../tools/hooks/index.js";
import type { ResolvedCustomTool } from "../tools/custom/index.js";
import { runHarness } from "./harness/harness-runner.js";
import { upsertGlobalMastraProvider } from "./config/settings.js";
import { buildMastraPermissionRules } from "./config/tool-approval-policy.js";
import { Memory } from "@mastra/memory";
import { LibSQLVector, LibSQLStore } from "@mastra/libsql";
import { fastembed } from "@mastra/fastembed";
import { createMastraCode, type MastraCodeConfig } from "mastracode";
import { join } from "node:path";
import { homedir } from "node:os";

export type {
  MastraMcpConfigPaths,
  MastraMcpServerStatus,
  MastraMcpSkippedServer,
  MastraMcpStatusSummary,
} from "./mcp/index.js";

export type { MastraHarness };
export { MASTRA_DISABLED_TOOLS, drainHarness };

/** Working memory template for CodeMap CLI context. */
const CODEMAP_WORKING_MEMORY_TEMPLATE = `# User Context

## Preferences
<!-- Agent records user preferences here -->

## Active Project
<!-- Current project name, repo, and branch -->

## Recent Decisions
<!-- Key decisions made during this session -->

## Notes
<!-- Anything else the agent should remember -->
`;

/**
 * Resolve the default database path used by mastracode.
 * Matches getDatabasePath() from mastracode internals.
 */
function getDatabasePath(): string {
  if (process.env.MASTRA_DB_PATH) {
    return process.env.MASTRA_DB_PATH;
  }
  const platform = process.platform;
  let baseDir: string;
  if (platform === "win32") {
    baseDir = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  } else if (platform === "darwin") {
    baseDir = join(homedir(), "Library", "Application Support");
  } else {
    baseDir = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  }
  return join(baseDir, "mastracode", "mastra.db");
}

/**
 * Resolve the default vector database path used by mastracode.
 * Matches getVectorDatabasePath() from mastracode internals.
 */
function getVectorDatabasePath(): string {
  const platform = process.platform;
  let baseDir: string;
  if (platform === "win32") {
    baseDir = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  } else if (platform === "darwin") {
    baseDir = join(homedir(), "Library", "Application Support");
  } else {
    baseDir = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  }
  return join(baseDir, "mastracode", "mastra-vectors.db");
}

/** Matches mastracode's DEFAULT_OBS_THRESHOLD / DEFAULT_REF_THRESHOLD. */
const DEFAULT_OBS_THRESHOLD = 30_000;
const DEFAULT_REF_THRESHOLD = 40_000;

/** Matches mastracode's DYNAMIC_AGENTS_MD_INSTRUCTION. */
const DYNAMIC_AGENTS_MD_INSTRUCTION =
  'Messages wrapped in <system-reminder type="dynamic-agents-md" ...>...</system-reminder> are ephemeral project-context instructions injected from files on disk. Do NOT observe or extract information from these messages — they are reloaded automatically when needed and should not be stored in memory.';

/** Cached memory instance — avoids recreating LibSQLVector + fastembed on every factory call. */
let cachedMemoryInstance: InstanceType<typeof Memory> | null = null;

interface CreateHarnessOptions {
  toolClient: SingleAgentRuntimeInput["toolClient"];
  baseUrl: string;
  apiKey: string | undefined;
  modelId: string;
  availableModels?: string[];
  availableCombos?: string[];
  providerId?: GatewayProviderId;
  modeDefaults?: { build?: string; plan?: string; fast?: string };
  onDebug?: (info: Record<string, unknown>) => void;
  extraServerConfigs?: Record<
    string,
    { command: string; args?: string[]; env?: Record<string, string> }
  >;
  /** Mastra tool definitions from CodeMapMcpToolClient — when provided, skips spawning a separate codemap MCP child process. */
  mastraTools?: Record<string, unknown>;
}

interface HarnessSingleton {
  harness: MastraHarness;
  mcpManager: MastraMcpManagerLike | undefined;
  mcpInitPromise: Promise<MastraMcpInitResult> | undefined;
  hookManager: { reload: () => void } | undefined;
  provider: GatewayProviderId;
  baseUrl: string;
  apiKey: string | undefined;
  mcpServerIds: Set<string>;
  modeDefaults?: { build?: string; plan?: string; fast?: string };
}

let singleton: HarnessSingleton | null = null;
let cachedCustomTools: ResolvedCustomTool[] = [];
let pendingNewThread = false;
let pendingThreadPromise: Promise<void> | null = null;

async function forceHarnessModel(
  harness: MastraHarness,
  modelId: string,
): Promise<void> {
  await harness.switchModel?.({ modelId, scope: "thread" });
  await harness.setState?.({ currentModelId: modelId });
}

async function getOrCreateHarness(
  opts: CreateHarnessOptions,
): Promise<MastraHarness> {
  const wanted = resolveHarnessModelId(
    opts.modelId,
    opts.availableModels,
    opts.availableCombos,
    opts.providerId,
  );
  if (
    singleton &&
    singleton.provider === (opts.providerId ?? "9router") &&
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
  return createFreshHarness(opts, wanted);
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
  const harness = await getOrCreateHarness({
    toolClient: input.toolClient,
    baseUrl: input.provider.baseUrl,
    apiKey: input.provider.apiKey,
    modelId: input.model,
    availableModels: input.availableModels,
    availableCombos: input.availableCombos,
    providerId: input.providerId,
    modeDefaults: input.modeDefaults,
    onDebug: input.onDebug,
    extraServerConfigs: input.toolClient.getExtraServerConfigs(),
  });
  await ensureMastraThread();
  startDrainTracking(harness);

  const modelId = harness.getCurrentModelId?.();
  if (modelId) input.onModel?.(modelId);
  input.onDebug?.({
    event: "mastra_model_resolved",
    requested: input.model,
    resolved: modelId ?? input.model,
    availableCount: input.availableModels?.length ?? 0,
  });
  applyAgentInstructions(harness, input.agentInstructions);

  if (input.planMode) {
    await harness.switchMode?.({ modeId: "plan" });
  }

  const callbacks = {
    onToken: input.onToken,
    onThinking: input.onThinking,
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
    onToolApproval: input.onToolApproval,
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

/** Ensure a thread exists — lazy thread creation on first message. */
export async function ensureMastraThread(): Promise<void> {
  if (!pendingNewThread || !singleton) return;
  // Deduplicate concurrent calls: reuse in-flight promise
  if (pendingThreadPromise) {
    await pendingThreadPromise;
    return;
  }
  pendingNewThread = false;
  pendingThreadPromise = singleton.harness
    .createThread()
    .then(
      () => {},
      () => {},
    )
    .finally(() => {
      pendingThreadPromise = null;
    });
  await pendingThreadPromise;
}

/** Destroy and forget the current harness — call when starting a new chat session. */
export async function resetHarnessSingleton(): Promise<void> {
  if (!singleton) return;
  clearDrainTracking();
  uninstallFetchInterceptor();
  const old = singleton;
  singleton = null;
  cachedMemoryInstance = null;
  pendingNewThread = false;
  pendingThreadPromise = null;

  // Clean up empty threads (threads with no user messages)
  try {
    const threadId = old.harness.getCurrentThreadId?.();
    if (threadId && (old.harness as any).deleteThread) {
      const messages = await old.harness.listMessagesForThread({ threadId });
      const hasUserMessage = messages.some((m: any) => m.role === "user");
      if (!hasUserMessage) {
        await (old.harness as any).deleteThread({ threadId });
      }
    }
  } catch (err) {
    console.debug("[harness] thread cleanup failed:", err);
  }

  try {
    await old.mcpManager?.disconnect?.();
  } catch (err) {
    console.debug("[harness] mcp disconnect failed:", err);
  }
  try {
    await old.harness.destroy?.();
  } catch (err) {
    console.debug("[harness] destroy failed:", err);
  }
}

/** After N messages in a thread, rotate to a fresh thread.
 *  With OM scope="resource", compressed observations carry over automatically.
 *  Returns message count if rotation happened, null otherwise. */
export async function maybeRotateHarnessThread(): Promise<{ messageCount: number } | null> {
  if (!singleton) return null;
  const { harness } = singleton;

  const threadId = harness.getCurrentThreadId?.();
  if (!threadId) return null;

  let messages: HarnessMessage[];
  try {
    messages = await harness.listMessagesForThread({ threadId });
  } catch {
    return null;
  }

  const THREAD_ROTATION_THRESHOLD = 40;
  if (messages.length < THREAD_ROTATION_THRESHOLD) return null;

  const messageCount = messages.length;

  try {
    // Create new thread and switch to it before deleting old one
    const newThread = await harness.createThread?.();
    if (newThread?.id) {
      await (harness as any).switchThread?.({ threadId: newThread.id });
    }
    pendingNewThread = false;

    // Delete old thread — Memory.deleteThread also removes associated vectors
    const memory = await (harness as any).getResolvedMemory?.();
    if (memory) {
      await memory.deleteThread(threadId);
    }
  } catch (err) {
    console.debug("[harness] thread rotation failed:", err);
    return null;
  }

  return { messageCount };
}

/** Create a brand-new harness and store it as the singleton. */
async function createFreshHarness(
  opts: CreateHarnessOptions,
  harnessModelId: string,
): Promise<MastraHarness> {
  const serverConfig = opts.toolClient.getServerConfig();

  installTemperatureInterceptor(opts.baseUrl);

  await upsertGlobalMastraProvider(
    {
      provider: opts.providerId,
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      availableModels: opts.availableModels,
      modeDefaults: opts.modeDefaults,
    },
    harnessModelId,
  );

  opts.onDebug?.({
    event: "mastra_provider_configured",
    harnessModelId,
    provider: opts.providerId ?? "9router",
    baseUrl: opts.baseUrl,
  });

  const extraServerKeys = Object.keys(opts.extraServerConfigs ?? {});
  const baseMcpServers = opts.mastraTools
    ? extraServerKeys.length > 0
      ? opts.extraServerConfigs
      : undefined
    : { codemap: serverConfig, ...opts.extraServerConfigs };
  const filteredMastraTools = opts.mastraTools;

  // Load custom tools from .codemap/tools/ (project + global)
  let mergedExtraTools: Record<string, unknown> | undefined;
  try {
    const { readWorkspacePath } =
      await import("@codemap/core/lib/workspace-project.js");
    const workspaceRoot = await readWorkspacePath();
    const { tools: customTools, mastraTools: customMastraTools } =
      await loadCustomTools(workspaceRoot);
    cachedCustomTools = customTools;

    if (Object.keys(customMastraTools).length > 0) {
      mergedExtraTools = {
        ...(filteredMastraTools ?? {}),
        ...customMastraTools,
      };
      opts.onDebug?.({
        event: "custom_tools_loaded",
        count: Object.keys(customMastraTools).length,
        names: Object.keys(customMastraTools),
      });
    } else if (filteredMastraTools) {
      mergedExtraTools = filteredMastraTools;
    }
  } catch {
    // Custom tools loading is non-fatal
    mergedExtraTools = filteredMastraTools;
  }

  const mcpServerIds = new Set(["codemap", ...extraServerKeys]);
  const config = {
    ...(baseMcpServers && Object.keys(baseMcpServers).length > 0
      ? { mcpServers: baseMcpServers }
      : {}),
    ...(mergedExtraTools ? { extraTools: mergedExtraTools } : {}),
    disabledTools: MASTRA_DISABLED_TOOLS,
    memory: () => {
      if (cachedMemoryInstance) {
        return cachedMemoryInstance;
      }

      const vectorDbPath = getVectorDatabasePath();
      const vector = new LibSQLVector({
        id: "mastra-code-vectors",
        url: `file:${vectorDbPath}`,
      });

      const dbPath = getDatabasePath();
      const storage = new LibSQLStore({
        id: "mastra-code-storage",
        url: `file:${dbPath}`,
      });

      cachedMemoryInstance = new Memory({
        storage,
        vector,
        embedder: fastembed.small,
        options: {
          // Cap sliding-window to avoid unbounded JSON growth (OOM) on long sessions.
          // Older messages are still reachable via semanticRecall + observationalMemory.
          lastMessages: 10,
          semanticRecall: {
            topK: 3,
            messageRange: 2,
          },
          workingMemory: {
            enabled: true,
            template: CODEMAP_WORKING_MEMORY_TEMPLATE,
          },
          observationalMemory: {
            enabled: true,
            temporalMarkers: true,
            retrieval: { vector: true },
            // resource scope: observations accumulate across threads, surviving rotation
            scope: "resource",
            activateAfterIdle: "5m",
            activateOnProviderChange: true,
            observation: {
              bufferTokens: 1 / 5,
              bufferActivation: 2_000,
              model: ({ requestContext }: { requestContext: any }) => {
                opts.onDebug?.({
                  event: "mastra_observation_model_request",
                  requestContext: {
                    harnessState: requestContext?.get?.("harness"),
                  },
                });
                const state = requestContext?.get?.("harness") as
                  | Record<string, unknown>
                  | undefined;
                const modelId =
                  (state?.observerModelId as string) ??
                  (effectiveDefaults?.fast as string) ??
                  harnessModelId;
                return resolveModel(modelId, {
                  remapForCodexOAuth: true,
                  requestContext,
                }) as any;
              },
              messageTokens: DEFAULT_OBS_THRESHOLD,
              blockAfter: 2,
              previousObserverTokens: 1_000,
              threadTitle: true,
              instruction: DYNAMIC_AGENTS_MD_INSTRUCTION,
            },
            reflection: {
              bufferActivation: 1 / 2,
              blockAfter: 1.1,
              model: ({ requestContext }: { requestContext: any }) => {
                opts.onDebug?.({
                  event: "mastra_reflection_model_request",
                  requestContext: {
                    harnessState: requestContext?.get?.("harness"),
                  },
                });
                const state = requestContext?.get?.("harness") as
                  | Record<string, unknown>
                  | undefined;
                const modelId =
                  (state?.reflectorModelId as string) ?? harnessModelId;
                return resolveModel(modelId, {
                  remapForCodexOAuth: true,
                  requestContext,
                }) as any;
              },
              observationTokens: DEFAULT_REF_THRESHOLD,
            },
          },
        },
      });

      return cachedMemoryInstance;
    },
    initialState: {
      currentModelId: harnessModelId,
      permissionRules: buildMastraPermissionRules(mcpServerIds) as any,
      yolo: false,
      observerModelId: harnessModelId,
      reflectorModelId: harnessModelId,
    },
  };

  const { harness, mcpManager, resolveModel, effectiveDefaults, hookManager } =
    await createMastraCode(config as MastraCodeConfig);

  await harness.init();

  // Sync CodeMap built-in hooks + user hooks to .mastracode/hooks.json
  // and reload the Mastra HookManager so they take effect.
  try {
    const workspaceRoot = process.env.WORKSPACE_ROOT ?? process.cwd();
    syncHooksToMastra(workspaceRoot);
    hookManager?.reload?.();
  } catch {
    /* non-fatal: hooks are optional */
  }

  pendingNewThread = true;
  await forceHarnessModel(harness, harnessModelId);

  const mcpInitPromise = startMastraMcpInitialization(mcpManager, opts.onDebug);

  singleton = {
    harness,
    mcpManager,
    mcpInitPromise,
    hookManager,
    provider: opts.providerId ?? "9router",
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    mcpServerIds,
    modeDefaults: opts.modeDefaults,
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

/** Get the list of loaded custom tools (for /tools command). */
export function getLoadedCustomTools(): ResolvedCustomTool[] {
  return cachedCustomTools;
}

/** Get the paths where custom tools are discovered. */
export { getCustomToolPaths };

/**
 * Re-sync hooks from .codemap/hooks.json to .mastracode/hooks.json
 * and reload the Mastra HookManager. Used by the /hooks command.
 */
export function reloadHooks(): void {
  try {
    const workspaceRoot = process.env.WORKSPACE_ROOT ?? process.cwd();
    syncHooksToMastra(workspaceRoot);
    singleton?.hookManager?.reload?.();
  } catch {
    /* non-fatal */
  }
}

export function getMastraCurrentModelId(): string | null {
  if (!singleton) return null;
  const raw = singleton.harness.getCurrentModelId?.() ?? null;
  return raw ? stripProviderPrefix(raw, singleton.provider) : null;
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
): Promise<HarnessMessage[]> {
  if (!singleton) return [];
  try {
    return await singleton.harness.listMessages({ limit });
  } catch {
    return [];
  }
}

export async function listMastraThreads(): Promise<HarnessThread[]> {
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
): Promise<HarnessMessage[]> {
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
    pendingNewThread = false;
    return true;
  } catch {
    return false;
  }
}

const AUTO_RESUME_MAX_AGE_DAYS = 7;

/**
 * Auto-resume the latest workspace thread if it's recent enough.
 * Returns the resumed thread ID, or null if starting fresh.
 */
export async function autoResumeLatestThread(): Promise<string | null> {
  if (!singleton) return null;
  try {
    const threads = await singleton.harness.listThreads();
    if (!threads.length) return null;

    const sorted = [...threads].sort(
      (a, b) =>
        new Date(b.updatedAt ?? 0).getTime() -
        new Date(a.updatedAt ?? 0).getTime(),
    );
    const latest = sorted[0]!;
    const updatedAt = new Date(latest.updatedAt ?? 0).getTime();
    const maxAge = AUTO_RESUME_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    if (Date.now() - updatedAt > maxAge) {
      return null;
    }

    await singleton.harness.switchThread({ threadId: latest.id });
    pendingNewThread = false;
    return latest.id;
  } catch {
    return null;
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
