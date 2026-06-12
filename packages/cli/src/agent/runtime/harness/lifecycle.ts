/**
 * CLI lifecycle adapter — injects CLI-specific dependencies into the core harness lifecycle.
 *
 * Core implementation: @codemap-ai/core/agent/harness/lifecycle
 * This file wraps it with CLI-specific: loadCustomTools, syncHooksToMastra,
 * buildMastraPermissionRules, loadSettings, upsertGlobalMastraProvider.
 */
import type {
  AgentLoopResult,
  SingleAgentRuntimeInput,
} from "@codemap-ai/core/agent";
import { loadCustomTools } from "../../tools/custom/index.js";
import { syncHooksToMastra } from "../../tools/hooks/index.js";
import { buildMastraPermissionRules } from "../config/tool-approval-policy.js";
import { loadSettings } from "../../../cli/settings.js";
import { upsertGlobalMastraProvider } from "@codemap-ai/core/agent/config";

// Re-export everything from core — callers don't need to change imports.
export type { MastraHarness, CreateHarnessOptions, HarnessSingleton, HarnessDeps, ResolvedCustomTool } from "@codemap-ai/core/agent";
export {
  MASTRA_DISABLED_TOOLS,
  drainHarness,
  ensureMastraThread,
  resetHarnessSingleton,
  getSingleton,
  getPendingNewThread,
  setPendingNewThread,
  getCachedCustomTools,
} from "@codemap-ai/core/agent";
// Re-export core's runWithMastraHarness under a different name for internal use.
import {
  runWithMastraHarness as coreRunWithMastraHarness,
  warmupHarness as coreWarmupHarness,
  type CreateHarnessOptions,
} from "@codemap-ai/core/agent";

// ── CLI-specific deps object ───────────────────────────────────────────

const cliHarnessDeps = {
  loadSettings,
  loadCustomTools,
  syncHooksToMastra,
  buildMastraPermissionRules: (mcpServerIds: Set<string>) =>
    buildMastraPermissionRules(mcpServerIds),
  upsertGlobalMastraProvider,
};

// ── Wrapped runWithMastraHarness (injects CLI deps) ────────────────────

export function warmupHarness(
  options: CreateHarnessOptions,
): Promise<void> {
  return coreWarmupHarness({ ...options, deps: cliHarnessDeps });
}

export async function runWithMastraHarness(
  input: SingleAgentRuntimeInput,
): Promise<AgentLoopResult> {
  return coreRunWithMastraHarness({ ...input, deps: cliHarnessDeps });
}
