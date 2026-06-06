/**
 * Introspection — model ID, thread ID, MCP status, token usage, OM status.
 *
 * Pure status getters extracted from harness-runtime.ts.
 */
import type { MastraMcpServerStatus, MastraMcpStatusSummary } from "../mcp/index.js";
import { stripProviderPrefix } from "../config/models.js";
import { getSingleton } from "../harness/lifecycle.js";

export function getMastraCurrentModelId(): string | null {
  const singleton = getSingleton();
  if (!singleton) return null;
  const raw = singleton.harness.getCurrentModelId?.() ?? null;
  return raw ? stripProviderPrefix(raw, singleton.provider) : null;
}

export function getMastraThreadId(): string | null {
  return getSingleton()?.harness.getCurrentThreadId?.() ?? null;
}

export function getMastraMcpServerStatuses(): MastraMcpServerStatus[] | null {
  return getSingleton()?.mcpManager?.getServerStatuses() ?? null;
}

export async function getMastraMcpStatusSummary(): Promise<MastraMcpStatusSummary | null> {
  const singleton = getSingleton();
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
  const singleton = getSingleton();
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

export function getMastraOMStatus(): {
  observationTokens: number;
  status: string;
} | null {
  const singleton = getSingleton();
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
