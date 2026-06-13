import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import type { ResolvedCustomTool, ScriptToolContext } from "./custom-tools-types.ts";

const TOOLS_DIR_NAME = "tools";
const SCRIPT_TOOL_EXT = ".tool.ts";
const SKIP_PREFIX = "_";

function getGlobalToolsDir(): string {
  return resolve(homedir(), ".codemap", TOOLS_DIR_NAME);
}

export function getProjectToolsDir(workspaceRoot: string): string {
  return resolve(workspaceRoot, ".codemap", TOOLS_DIR_NAME);
}

export function getCustomToolPaths(workspaceRoot: string): string[] {
  return [getGlobalToolsDir(), getProjectToolsDir(workspaceRoot)];
}

async function readScriptTool(
  filePath: string,
  toolsDir: string,
  source: "project" | "global",
  workspace: string,
): Promise<ResolvedCustomTool | null> {
  try {
    const mod = await import(filePath);
    const tool = mod?.default ?? mod;

    if (!tool || typeof tool !== "object") {
      console.warn(`[custom-tools] skipping ${filePath}: no valid export found`);
      return null;
    }

    const name = typeof tool.name === "string" ? tool.name.trim() : "";
    if (!name) {
      console.warn(`[custom-tools] skipping ${filePath}: missing "name" field`);
      return null;
    }

    const description =
      typeof tool.description === "string" ? tool.description.trim() : name;

    if (typeof tool.execute !== "function") {
      console.warn(
        `[custom-tools] skipping ${filePath}: missing "execute" function`,
      );
      return null;
    }

    const ctx: ScriptToolContext = { toolsDir, workspace };
    const parameters =
      tool.parameters && typeof tool.parameters === "object"
        ? (tool.parameters as Record<string, unknown>)
        : undefined;

    const resolved: ResolvedCustomTool = {
      name,
      description,
      parameters,
      source,
      executeFn: async (input: Record<string, unknown>) => {
        return (tool.execute as Function)(input, ctx);
      },
      scriptPath: filePath,
    };
    return resolved;
  } catch (err) {
    console.warn(`[custom-tools] failed to load ${filePath}:`, err);
    return null;
  }
}

async function discoverTools(
  toolsDir: string,
  source: "project" | "global",
  workspace: string,
): Promise<ResolvedCustomTool[]> {
  let entries: string[];
  try {
    entries = await readdir(toolsDir);
  } catch {
    return [];
  }

  const tsFiles = entries.filter(
    (f) => f.endsWith(SCRIPT_TOOL_EXT) && !f.startsWith(SKIP_PREFIX),
  );

  const resolved = await Promise.all(
    tsFiles.map((f) =>
      readScriptTool(join(toolsDir, f), toolsDir, source, workspace),
    ),
  );

  return resolved.filter((t): t is ResolvedCustomTool => t !== null);
}

export async function loadCustomTools(
  workspaceRoot: string,
): Promise<{ resolvedTools: ResolvedCustomTool[]; extraTools: Record<string, unknown>; paths: string[] }> {
  const globalToolsDir = getGlobalToolsDir();
  const projectToolsDir = getProjectToolsDir(workspaceRoot);
  const paths = [globalToolsDir, projectToolsDir];

  const [globalTools, projectTools] = await Promise.all([
    discoverTools(globalToolsDir, "global", workspaceRoot),
    discoverTools(projectToolsDir, "project", workspaceRoot),
  ]);

  const resolvedTools = [...globalTools, ...projectTools];
  const extraTools: Record<string, unknown> = {};

  for (const tool of resolvedTools) {
    extraTools[tool.name] = buildMastraTool(tool);
  }

  return { resolvedTools, extraTools, paths };
}

function buildMastraTool(resolved: ResolvedCustomTool): unknown {
  const parametersSchema = resolved.parameters ?? {
    type: "object" as const,
    properties: { input: { type: "string" } },
  };

  return {
    description: resolved.description,
    parameters: parametersSchema,
    execute: async (
      input: Record<string, unknown>,
    ): Promise<{ content: string }> => {
      const result = await resolved.executeFn(input, {
        toolsDir: getGlobalToolsDir(),
        workspace: "",
      });
      return {
        content: typeof result === "string" ? result : JSON.stringify(result),
      };
    },
  };
}
