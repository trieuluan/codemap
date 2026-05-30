import path from "node:path";
import { readWorkspaceProjectConfig } from "./workspace-project.js";
import {
  tryGetCurrentWorkspaceInfo,
  type CurrentWorkspaceInfo,
} from "./workspace-git.js";

type ProjectLike = {
  localWorkspacePath?: string | null;
};

export interface ResolvedWorkspace {
  cwd: string;
  workspace: CurrentWorkspaceInfo | null;
  workspaceRootPath: string;
  resolution: "git" | "linked_config" | "project_local_path" | "cwd_fallback";
}

export async function resolveWorkspace(input?: {
  cwd?: string;
  project?: ProjectLike | null;
}): Promise<ResolvedWorkspace> {
  const cwd = input?.cwd ?? process.cwd();
  const envWorkspaceRoot = process.env.WORKSPACE_ROOT?.trim() || null;
  const candidates: Array<{
    path: string;
    resolution: ResolvedWorkspace["resolution"];
  }> = [];

  if (envWorkspaceRoot) {
    candidates.push({ path: envWorkspaceRoot, resolution: "linked_config" });
  }

  candidates.push({ path: cwd, resolution: "git" });

  const config = await readWorkspaceProjectConfig(cwd);
  if (config.workspaceRootPath) {
    candidates.push({
      path: config.workspaceRootPath,
      resolution: "linked_config",
    });
  }

  if (input?.project?.localWorkspacePath) {
    candidates.push({
      path: input.project.localWorkspacePath,
      resolution: "project_local_path",
    });
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const candidatePath = path.resolve(candidate.path);
    if (seen.has(candidatePath)) continue;
    seen.add(candidatePath);

    const workspace = await tryGetCurrentWorkspaceInfo(candidatePath);
    if (workspace) {
      return {
        cwd,
        workspace,
        workspaceRootPath: workspace.repoRootPath,
        resolution: candidate.resolution,
      };
    }
  }

  return {
    cwd,
    workspace: null,
    workspaceRootPath: config.workspaceRootPath ?? cwd,
    resolution: "cwd_fallback",
  };
}
