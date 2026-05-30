import path from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { tryGetCurrentWorkspaceInfo } from "./workspace-git.js";
import { findMonorepoRoot } from "./monorepo-root.js";

const WORKSPACE_CONFIG_FILE = ".codemap/mcp.json";

export interface McpServerConfig {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  priorityResources?: string[];
}

export interface WorkspaceProjectConfig {
  projectId: string | null;
  workspaceRootPath: string | null;
  mcpServers?: Record<string, McpServerConfig>;
}

async function readWorkspaceProjectConfigAt(configPath: string) {
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  let mcpServers: Record<string, McpServerConfig> | undefined;
  if (
    parsed.mcpServers &&
    typeof parsed.mcpServers === "object" &&
    !Array.isArray(parsed.mcpServers)
  ) {
    mcpServers = {};
    for (const [name, config] of Object.entries(
      parsed.mcpServers as Record<string, unknown>,
    )) {
      if (config && typeof config === "object" && !Array.isArray(config)) {
        const sc = config as Record<string, unknown>;
        const entry: McpServerConfig = {};
        if (typeof sc.type === "string") entry.type = sc.type;
        if (typeof sc.command === "string") entry.command = sc.command;
        if (Array.isArray(sc.args))
          entry.args = sc.args.filter(
            (a): a is string => typeof a === "string",
          );
        if (sc.env && typeof sc.env === "object" && !Array.isArray(sc.env)) {
          entry.env = {};
          for (const [k, v] of Object.entries(
            sc.env as Record<string, unknown>,
          )) {
            if (typeof v === "string") entry.env[k] = v;
          }
        }
        if (Array.isArray(sc.priorityResources)) {
          entry.priorityResources = sc.priorityResources.filter(
            (r): r is string => typeof r === "string",
          );
        }
        mcpServers[name] = entry;
      }
    }
  }

  return {
    projectId:
      typeof parsed.projectId === "string" && parsed.projectId.trim()
        ? parsed.projectId.trim()
        : null,
    workspaceRootPath:
      typeof parsed.workspaceRootPath === "string" &&
      parsed.workspaceRootPath.trim()
        ? parsed.workspaceRootPath.trim()
        : null,
    mcpServers,
  };
}

async function pathExists(filePath: string | null | undefined) {
  if (!filePath) return false;
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readWorkspaceProjectConfig(
  cwd = process.cwd(),
): Promise<WorkspaceProjectConfig> {
  const candidateRoots = new Set<string>();
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();

  if (workspaceRoot) {
    candidateRoots.add(workspaceRoot);
  }

  candidateRoots.add(cwd);
  let resolvedRepoRoot: string | null = null;

  for (const root of Array.from(candidateRoots)) {
    const workspace = await tryGetCurrentWorkspaceInfo(root);
    if (workspace?.repoRootPath) {
      candidateRoots.add(workspace.repoRootPath);
      resolvedRepoRoot ??= workspace.repoRootPath;
    }
  }

  // Add monorepo root as candidate (pnpm/yarn/npm/bun workspaces)
  try {
    candidateRoots.add(await findMonorepoRoot(cwd));
  } catch {
    // findMonorepoRoot already has git fallback; ignore errors
  }

  for (const root of candidateRoots) {
    try {
      const config = await readWorkspaceProjectConfigAt(
        path.join(root, WORKSPACE_CONFIG_FILE),
      );
      const savedWorkspaceRoot =
        config.workspaceRootPath && (await pathExists(config.workspaceRootPath))
          ? config.workspaceRootPath
          : null;

      return {
        ...config,
        workspaceRootPath: savedWorkspaceRoot ?? root,
      };
    } catch {
      // Try the next candidate root.
    }
  }

  return {
    projectId: null,
    workspaceRootPath: workspaceRoot ?? resolvedRepoRoot,
  };
}

/**
 * Reads priority resource URIs for a given MCP server name from `.codemap/mcp.json`.
 * Returns empty array if no config or no priorityResources found.
 */
export async function readPriorityResources(
  serverName = "codemap",
  cwd = process.cwd(),
): Promise<string[]> {
  const config = await readWorkspaceProjectConfig(cwd);
  return config.mcpServers?.[serverName]?.priorityResources ?? [];
}

/**
 * Reads external MCP server configs from both global (`~/.codemap/mcp.json`) and
 * project-level (`.codemap/mcp.json`) configs, merging them with project taking precedence.
 * Only returns entries that have a `command` field (valid stdio servers).
 * Returns a Map of server name → entry config.
 */
export async function readMcpServerConfigs(
  cwd = process.cwd(),
  globalMcpServers?: Record<
    string,
    { command?: string; args?: string[]; env?: Record<string, string> }
  >,
): Promise<
  Map<
    string,
    { command: string; args?: string[]; env?: Record<string, string> }
  >
> {
  const config = await readWorkspaceProjectConfig(cwd);
  const result = new Map<
    string,
    { command: string; args?: string[]; env?: Record<string, string> }
  >();

  // Apply global servers first (lower priority)
  if (globalMcpServers) {
    for (const [name, entry] of Object.entries(globalMcpServers)) {
      if (entry.command) {
        result.set(name, {
          command: entry.command,
          args: entry.args,
          env: entry.env,
        });
      }
    }
  }

  // Apply project-level servers (higher priority — overrides global)
  if (config.mcpServers) {
    for (const [name, entry] of Object.entries(config.mcpServers)) {
      if (entry.command) {
        result.set(name, {
          command: entry.command,
          args: entry.args,
          env: entry.env,
        });
      }
    }
  }

  return result;
}

/**
 * Reads the CodeMap project ID linked to a workspace directory.
 * Looks for a `projectId` field inside `.codemap/mcp.json` at the repo root.
 * Returns null if the file doesn't exist or contains no projectId.
 */
export async function readWorkspaceProjectId(
  cwd = process.cwd(),
): Promise<string | null> {
  return (await readWorkspaceProjectConfig(cwd)).projectId;
}

/**
 * Returns the resolved workspace root path (git repo root, or cwd as fallback).
 */
export async function readWorkspacePath(cwd = process.cwd()): Promise<string> {
  const config = await readWorkspaceProjectConfig(cwd);
  if (config.workspaceRootPath) return config.workspaceRootPath;
  const workspace = await tryGetCurrentWorkspaceInfo(cwd);
  return workspace?.repoRootPath ?? cwd;
}

/**
 * Saves a CodeMap project ID into `.codemap/mcp.json` at the given workspace root.
 * Merges with any existing fields in the file so auth config is preserved.
 */
export async function saveWorkspaceProjectId(
  workspaceRoot: string,
  projectId: string,
): Promise<void> {
  const configPath = path.join(workspaceRoot, WORKSPACE_CONFIG_FILE);

  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(configPath, "utf8");
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // File doesn't exist yet — start fresh
  }

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify({ ...existing, projectId, workspaceRootPath: workspaceRoot }, null, 2)}\n`,
    "utf8",
  );
}

/**
 * Adds or updates an MCP server entry in `.codemap/mcp.json`.
 */
export async function saveMcpServerEntry(
  workspaceRoot: string,
  name: string,
  entry: { command: string; args?: string[]; env?: Record<string, string> },
): Promise<void> {
  const configPath = path.join(workspaceRoot, WORKSPACE_CONFIG_FILE);

  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(configPath, "utf8");
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // File doesn't exist yet
  }

  const mcpServers = (existing.mcpServers ?? {}) as Record<string, unknown>;
  mcpServers[name] = entry;

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify({ ...existing, mcpServers }, null, 2)}\n`,
    "utf8",
  );
}

/**
 * Removes an MCP server entry from `.codemap/mcp.json`.
 */
export async function removeMcpServerEntry(
  workspaceRoot: string,
  name: string,
): Promise<boolean> {
  const configPath = path.join(workspaceRoot, WORKSPACE_CONFIG_FILE);

  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(configPath, "utf8");
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }

  const mcpServers = (existing.mcpServers ?? {}) as Record<string, unknown>;
  if (!(name in mcpServers)) return false;

  delete mcpServers[name];
  existing.mcpServers = mcpServers;

  await writeFile(configPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
  return true;
}
