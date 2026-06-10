import type { CodeMapMcpToolClient } from "../../../agent/tools/mcp/mcp-tool-client.js";
import { fetchResourceContext } from "../../../agent/tools/mcp/mcp-tool-client.js";
import { resolveWorkspace } from "@codemap-ai/core/lib/workspace-resolver.js";
import {
  loadExtraConventions,
} from "../config/extra-conventions.js";

export interface ProjectContext {
  conventions: string | null;
  rules: string | null;
}

export interface SessionContextCache {
  resourceContext: string | null | undefined; // undefined = not yet fetched
  projectContext: ProjectContext | undefined;
}

export function createSessionContextCache(): SessionContextCache {
  return {
    resourceContext: undefined,
    projectContext: undefined,
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
};

export async function getSessionProjectContext(
  cache: SessionContextCache,
): Promise<ProjectContext> {
  if (cache.projectContext !== undefined) return cache.projectContext;
  try {
    const resolved = await resolveWorkspace();
    cache.projectContext = await loadExtraConventions(resolved.workspaceRootPath);
  } catch {
    cache.projectContext = EMPTY_PROJECT_CONTEXT;
  }
  return cache.projectContext ?? EMPTY_PROJECT_CONTEXT;
}
