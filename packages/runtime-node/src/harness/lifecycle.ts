/**
 * Harness lifecycle — singleton management, factory, warmup, run, reset.
 *
 * Injectable dependencies (loadSettings, loadCustomTools, syncHooksToMastra,
 * buildMastraPermissionRules, upsertGlobalMastraProvider) are provided via
 * `CreateHarnessOptions.deps` so both CLI and desktop can supply their own
 * implementations.
 */
import type { AgentLoopResult, GatewayProviderId } from "@codemap-ai/core/agent";
import type { SingleAgentRuntimeInput } from "../runtime-input.js";
import type { MastraHarness } from "../events.js";
import {
  clearDrainTracking,
  drainHarness,
  startDrainTracking,
} from "./drain.js";
import {
  getLastModelApiError,
  getLastResponseDebugInfo,
  installResolvedModelInterceptor,
  uninstallFetchInterceptor,
} from "./fetch-interceptor.js";
import { applyAgentInstructions } from "./instructions.js";
import {
  MASTRA_DISABLED_TOOLS,
  type MastraMcpInitResult,
  type MastraMcpManagerLike,
  startMastraMcpInitialization,
} from "@codemap-ai/core/agent";
import { resolveHarnessModelId } from "@codemap-ai/core/agent/config";
import { runHarness } from "./harness-runner.js";
import { Memory } from "@mastra/memory";
import { LibSQLVector, LibSQLStore } from "@mastra/libsql";
import { fastembed } from "@mastra/fastembed";
import { createMastraCode, type MastraCodeConfig } from "mastracode";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ResolvedCustomTool } from "../tools/custom/index.js";
import { loadCustomTools } from "../tools/custom/index.js";
import { syncHooksToMastra } from "../tools/hooks/index.js";
import { loadSettings } from "../settings.js";
import { upsertGlobalMastraProvider } from "../config/mastra-settings.js";
import { buildAgentPermissionRules } from "@codemap-ai/core/agent";

// ── Re-exports used by callers via harness-runtime barrel ──────────────
export type { MastraHarness };
export { MASTRA_DISABLED_TOOLS, drainHarness };

// ── Injectable dependencies ────────────────────────────────────────────

/**
 * Functions that must be provided by the host (CLI or desktop app).
 * All fields are optional — missing deps are skipped gracefully.
 */
export interface HarnessDeps {
  /** Load CLI/app settings (workingMemory toggle, etc.). */
  loadSettings?: () => Promise<{ agent?: { workingMemory?: boolean } }>;
  /** Load custom .tool.ts files from the workspace. */
  loadCustomTools?: (
    workspaceRoot: string,
  ) => Promise<{
    resolvedTools: ResolvedCustomTool[];
    extraTools: Record<string, unknown>;
  }>;
  /** Sync CodeMap hooks to .mastracode/hooks.json. */
  syncHooksToMastra?: (workspaceRoot: string) => void;
  /** Build Mastra permission rules for the given MCP server IDs. */
  buildMastraPermissionRules?: (
    mcpServerIds: Set<string>,
  ) => any;
  /** Register a provider in Mastra's global registry. */
  upsertGlobalMastraProvider?: (
    config: {
      baseUrl: string;
      apiKey: string | undefined;
      provider: GatewayProviderId;
      availableModels?: string[];
      modeDefaults?: { build?: string; plan?: string; fast?: string };
    },
    modelId: string,
  ) => Promise<unknown> | unknown;
}

const defaultNodeHarnessDeps: HarnessDeps = {
  loadSettings,
  loadCustomTools,
  syncHooksToMastra,
  buildMastraPermissionRules: buildAgentPermissionRules,
  upsertGlobalMastraProvider,
};

// ── Constants ──────────────────────────────────────────────────────────

/** Working memory template for CodeMap context. */
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

/** Matches mastracode's DEFAULT_OBS_THRESHOLD / DEFAULT_REF_THRESHOLD. */
const DEFAULT_OBS_THRESHOLD = 30_000;
const DEFAULT_REF_THRESHOLD = 40_000;

/** Matches mastracode's DYNAMIC_AGENTS_MD_INSTRUCTION. */
const DYNAMIC_AGENTS_MD_INSTRUCTION =
  'Messages wrapped in <system-reminder type="dynamic-agents-md" ...>...</system-reminder> are ephemeral project-context instructions injected from files on disk. Do NOT observe or extract information from these messages — they are reloaded automatically when needed and should not be stored in memory.';

// ── Private helpers ────────────────────────────────────────────────────

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

// ── Types ──────────────────────────────────────────────────────────────

export interface CreateHarnessOptions {
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
  /** Injectable host-specific dependencies. */
  deps?: HarnessDeps;
}

export interface HarnessSingleton {
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

export function createDefaultPermissionRules(): {
  categories: Record<string, never>;
  tools: Record<string, never>;
} {
  return { categories: {}, tools: {} };
}

// ── Singleton state ────────────────────────────────────────────────────

let singleton: HarnessSingleton | null = null;
let cachedCustomTools: ResolvedCustomTool[] = [];
let pendingNewThread = false;
let pendingThreadPromise: Promise<void> | null = null;

/** Cached memory instance — avoids recreating LibSQLVector + fastembed on every factory call. */
let cachedMemoryInstance: InstanceType<typeof Memory> | null = null;

// ── State accessors (for threads.ts and introspection/) ────────────────

/** @internal Read-only access to the current singleton. */
export function getSingleton(): HarnessSingleton | null {
  return singleton;
}

/** @internal Mutable access for thread-management operations. */
export function getPendingNewThread(): boolean {
  return pendingNewThread;
}

/** @internal Mutable setter for thread-management operations. */
export function setPendingNewThread(value: boolean): void {
  pendingNewThread = value;
}

/** @internal Read-only access to cached custom tools. */
export function getCachedCustomTools(): ResolvedCustomTool[] {
  return cachedCustomTools;
}

// ── Private lifecycle helpers ──────────────────────────────────────────

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
    installResolvedModelInterceptor(opts.baseUrl);
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

// ── Exported lifecycle API ─────────────────────────────────────────────

/** Pre-initialize the harness singleton in the background so the first chat turn has no cold-start delay. */
export function warmupHarness(opts: CreateHarnessOptions): Promise<void> {
  return getOrCreateHarness({
    ...opts,
    deps: opts.deps ?? defaultNodeHarnessDeps,
  }).then(() => {});
}

/**
 * Run a single-turn agent through the Mastra Harness.
 */
export async function runWithMastraHarness(
  input: SingleAgentRuntimeInput,
): Promise<AgentLoopResult> {
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
    deps: input.deps ?? defaultNodeHarnessDeps,
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
    toolPreviewBuilder: input.toolPreviewBuilder,
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
    // no-op: fetch interceptor state is reset on install/uninstall
  }

  if (!result.text.trim() && !input.signal?.aborted) {
    // Give the fetch interceptor's background stream reader a moment to
    // finish capturing an inline error chunk before snapshotting it.
    await new Promise((r) => setTimeout(r, 100));
    input.onDebug?.({
      event: "mastra_empty_response_reset_singleton",
      model: harness.getCurrentModelId?.(),
      lastModelApiError: getLastModelApiError()?.message,
      lastResponse: getLastResponseDebugInfo(),
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

// ── Factory ────────────────────────────────────────────────────────────

/** Create a brand-new harness and store it as the singleton. */
async function createFreshHarness(
  opts: CreateHarnessOptions,
  harnessModelId: string,
): Promise<MastraHarness> {
  installResolvedModelInterceptor(opts.baseUrl);

  // Force the resolved model before first agent turn so the provider is
  // registered in Mastra's global registry with the correct baseUrl/apiKey.
  const serverConfig = opts.toolClient.getServerConfig();
  await opts.deps?.upsertGlobalMastraProvider?.(
    {
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      provider: opts.providerId ?? "9router",
      availableModels: opts.availableModels,
      modeDefaults: opts.modeDefaults,
    },
    harnessModelId,
  );

  const settings = await opts.deps?.loadSettings?.();
  const workingMemoryEnabled = settings?.agent?.workingMemory ?? true;

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
    if (opts.deps?.loadCustomTools) {
      const { readWorkspacePath } =
        await import("@codemap-ai/core/lib/workspace-project.js");
      const workspaceRoot = await readWorkspacePath();
      const { resolvedTools, extraTools: customMastraTools } =
        await opts.deps.loadCustomTools(workspaceRoot);
      cachedCustomTools = resolvedTools;

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
    } else {
      mergedExtraTools = filteredMastraTools;
    }
  } catch {
    // Custom tools loading is non-fatal
    mergedExtraTools = filteredMastraTools;
  }

  const mcpServerIds = new Set(["codemap", ...extraServerKeys]);
  const permissionRules =
    opts.deps?.buildMastraPermissionRules?.(mcpServerIds) ??
    createDefaultPermissionRules();
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
            // Reduced from 3 to 1 to limit feedback-loop reinforcement of bad
            // response patterns saved from previous crashed sessions.
            topK: 1,
            messageRange: 2,
          },
          workingMemory: {
            enabled: workingMemoryEnabled,
            template: CODEMAP_WORKING_MEMORY_TEMPLATE,
          },
          observationalMemory: {
            enabled: true,
            temporalMarkers: true,
            retrieval: { vector: true },
            scope: "thread",
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
      permissionRules: permissionRules as any,
      yolo: true,
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
    if (opts.deps?.syncHooksToMastra) {
      const workspaceRoot = process.env.WORKSPACE_ROOT ?? process.cwd();
      opts.deps.syncHooksToMastra(workspaceRoot);
    }
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
