import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tryGetCurrentWorkspaceInfo } from "./workspace-git.js";

const WORKSPACE_CONFIG_FILE = ".codemap/mcp.json";

export interface WorkspaceProjectConfig {
  projectId: string | null;
  workspaceRootPath: string | null;
}

async function readWorkspaceProjectConfigAt(configPath: string) {
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;

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
  };
}

export async function readWorkspaceProjectConfig(
  cwd = process.cwd(),
): Promise<WorkspaceProjectConfig> {
  const candidateRoots = new Set<string>([cwd]);

  const workspace = await tryGetCurrentWorkspaceInfo(cwd);
  if (workspace?.repoRootPath) {
    candidateRoots.add(workspace.repoRootPath);
  }

  for (const root of candidateRoots) {
    try {
      const config = await readWorkspaceProjectConfigAt(
        path.join(root, WORKSPACE_CONFIG_FILE),
      );
      return {
        ...config,
        workspaceRootPath: config.workspaceRootPath ?? root,
      };
    } catch {
      // Try the next candidate root.
    }
  }

  return {
    projectId: null,
    workspaceRootPath: workspace?.repoRootPath ?? null,
  };
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
