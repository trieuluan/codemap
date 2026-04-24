import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tryGetCurrentWorkspaceInfo } from "./workspace-git.js";

const WORKSPACE_CONFIG_FILE = ".codemap/mcp.json";

/**
 * Reads the CodeMap project ID linked to a workspace directory.
 * Looks for a `projectId` field inside `.codemap/mcp.json` at the repo root.
 * Returns null if the file doesn't exist or contains no projectId.
 */
export async function readWorkspaceProjectId(
  cwd = process.cwd(),
): Promise<string | null> {
  try {
    // Prefer the git repo root over cwd so the config is always found
    // at the same place regardless of which subdirectory the agent is in.
    const workspace = await tryGetCurrentWorkspaceInfo(cwd);
    const root = workspace?.repoRootPath ?? cwd;
    const configPath = path.join(root, WORKSPACE_CONFIG_FILE);

    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (typeof parsed.projectId === "string" && parsed.projectId.trim()) {
      return parsed.projectId.trim();
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Returns the resolved workspace root path (git repo root, or cwd as fallback).
 */
export async function readWorkspacePath(cwd = process.cwd()): Promise<string> {
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
    `${JSON.stringify({ ...existing, projectId }, null, 2)}\n`,
    "utf8",
  );
}
