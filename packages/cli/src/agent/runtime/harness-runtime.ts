/**
 * Barrel re-export — preserves existing import paths for all 12 callers.
 *
 * Actual implementations live in:
 *   ./harness/lifecycle.ts   — singleton, warmup, run, reset, ensureThread, factory
 *   ./harness/threads.ts     — list/switch/messages/autoResume
 *   ./introspection/status.ts — model/thread/MCP/token/OM status getters
 *   ./introspection/tools.ts  — custom tools, hooks reload
 */

// ── Re-exports from mcp (types) ───────────────────────────────────────
export type {
  MastraMcpConfigPaths,
  MastraMcpServerStatus,
  MastraMcpSkippedServer,
  MastraMcpStatusSummary,
} from "@codemap-ai/core/agent";

// ── Lifecycle ──────────────────────────────────────────────────────────
export type { MastraHarness } from "./harness/lifecycle.js";
export {
  MASTRA_DISABLED_TOOLS,
  drainHarness,
  warmupHarness,
  runWithMastraHarness,
  ensureMastraThread,
  resetHarnessSingleton,
} from "./harness/lifecycle.js";

// ── Threads ────────────────────────────────────────────────────────────
export {
  getMastraMessages,
  listMastraThreads,
  listMastraThreadMessages,
  switchMastraThread,
  autoResumeLatestThread,
} from "@codemap-ai/core/agent";

// ── Introspection ──────────────────────────────────────────────────────
export {
  getMastraCurrentModelId,
  getMastraThreadId,
  getMastraMcpServerStatuses,
  getMastraMcpStatusSummary,
  getMastraThreadTokenUsage,
  getMastraDisplayState,
  getMastraOMStatus,
  getLoadedCustomTools,
  getCustomToolPaths,
  reloadHooks,
} from "./introspection/index.js";
