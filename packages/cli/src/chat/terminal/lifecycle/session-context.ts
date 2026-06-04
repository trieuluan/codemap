import type { CodeMapMcpToolClient } from "../../../agent/tools/mcp/mcp-tool-client.js";
import { fetchResourceContext } from "../../../agent/tools/mcp/mcp-tool-client.js";
import { getCachedContext } from "../../../agent/core/convention-synthesizer.js";
import type { SessionTree } from "../../session-tree.js";
import { getPath } from "../../session-tree.js";

export interface ProjectContext {
  conventions: string | null;
  rules: string | null;
  skills: string | null;
}

export interface SessionContextCache {
  resourceContext: string | null | undefined; // undefined = not yet fetched
  projectContext: ProjectContext | undefined;
  /** Cached branch context summaries for the active path. */
  branchSummaries: BranchSummary[];
}

export interface BranchSummary {
  entryId: string;
  summary: string;
  timestamp: number;
}

export function createSessionContextCache(): SessionContextCache {
  return {
    resourceContext: undefined,
    projectContext: undefined,
    branchSummaries: [],
  };
}

export async function getSessionResourceContext(
  cache: SessionContextCache,
  toolClient: CodeMapMcpToolClient,
  _signal?: AbortSignal,
): Promise<string | null> {
  if (cache.resourceContext !== undefined) return cache.resourceContext;
  try {
    cache.resourceContext = await fetchResourceContext(toolClient);
  } catch {
    cache.resourceContext = null;
  }
  return cache.resourceContext;
}

const EMPTY_PROJECT_CONTEXT: ProjectContext = {
  conventions: null,
  rules: null,
  skills: null,
};

export async function getSessionProjectContext(
  cache: SessionContextCache,
): Promise<ProjectContext> {
  if (cache.projectContext !== undefined) return cache.projectContext;
  try {
    cache.projectContext = await getCachedContext();
  } catch {
    cache.projectContext = EMPTY_PROJECT_CONTEXT;
  }
  return cache.projectContext ?? EMPTY_PROJECT_CONTEXT;
}

/**
 * Extract branch summaries from the active path of a session tree.
 * These provide context about abandoned branches so the LLM knows what was tried before.
 */
export function extractBranchSummaries(tree: SessionTree): BranchSummary[] {
  const path = getPath(tree);
  return path
    .filter((e) => e.type === "branch_summary")
    .map((e) => ({
      entryId: e.id,
      summary: e.content ?? "",
      timestamp: e.timestamp,
    }));
}

/**
 * Invalidate the session context cache when switching branches.
 * Preserves resourceContext (workspace-level) but clears branch-specific data.
 */
export function invalidateBranchContext(cache: SessionContextCache): void {
  cache.branchSummaries = [];
  // projectContext and resourceContext are workspace-level, keep them
}

/**
 * Format branch summaries as context text for the LLM system prompt.
 */
export function formatBranchContext(summaries: BranchSummary[]): string | null {
  if (summaries.length === 0) return null;
  const lines = summaries.map((s) => `- ${s.summary}`);
  return `Previous branch context (abandoned conversation paths):\n${lines.join("\n")}`;
}
