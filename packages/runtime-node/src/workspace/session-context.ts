import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { CodeMapMcpToolClient } from "../tools/mcp/mcp-tool-client.js";
import { fetchResourceContext } from "../tools/mcp/mcp-tool-client.js";
import { resolveWorkspace } from "@codemap-ai/core/lib/workspace-resolver.js";

export interface ProjectContext {
  conventions: string | null;
  rules: string | null;
}

export interface SessionContextCache {
  resourceContext: string | null | undefined; // undefined = not yet fetched
  projectContext: ProjectContext | undefined;
}

const EXTRA_CONVENTION_SOURCES = [
  { label: "Cursor", paths: [".cursorrules", ".cursor/rules/*.mdc"] },
  { label: "Windsurf", paths: [".windsurfrules"] },
  {
    label: "GitHub Copilot",
    paths: [".github/copilot-instructions.md"],
  },
  { label: "Cline", paths: [".clinerules"] },
  { label: "General", paths: ["CONVENTIONS.md"] },
];
const EXTRA_RULE_SOURCES = [
  { label: "Cursor rules", paths: [".cursor/rules/*.mdc"] },
];

export async function loadExtraConventions(
  projectPath: string,
): Promise<ProjectContext> {
  const [conventions, rules] = await Promise.all([
    scanConventionSources(projectPath, EXTRA_CONVENTION_SOURCES),
    scanConventionSources(projectPath, EXTRA_RULE_SOURCES),
  ]);
  return { conventions, rules };
}

async function scanConventionSources(
  projectPath: string,
  sources: Array<{ label: string; paths: string[] }>,
): Promise<string | null> {
  const files: string[] = [];
  for (const source of sources) {
    for (const pattern of source.paths) {
      const matches = await expandConventionPattern(projectPath, pattern);
      for (const relativePath of matches) {
        try {
          const content = await readFile(
            path.join(projectPath, relativePath),
            "utf8",
          );
          if (content.trim()) {
            files.push(`=== ${source.label}: ${relativePath} ===\n${content}`);
          }
        } catch {
          // Ignore unreadable optional convention files.
        }
      }
    }
  }
  return files.length > 0 ? files.join("\n\n") : null;
}

async function expandConventionPattern(
  root: string,
  pattern: string,
): Promise<string[]> {
  if (!pattern.includes("*")) {
    try {
      await stat(path.join(root, pattern));
      return [pattern];
    } catch {
      return [];
    }
  }

  const parent = path.dirname(pattern);
  const extension = path.extname(pattern.replace("*", "rule"));
  try {
    const entries = await readdir(path.join(root, parent));
    return entries
      .filter((entry) => !extension || entry.endsWith(extension))
      .map((entry) => path.posix.join(parent, entry));
  } catch {
    return [];
  }
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
