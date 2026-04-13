import { cp, mkdir, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export interface RepositoryWorkspaceLocation {
  storageRoot: string;
  storageKey: string;
  workspacePath: string;
}

export function resolveRepositoryWorkspaceStorageRoot() {
  return (
    process.env.CODEMAP_STORAGE_ROOT?.trim() ||
    path.join(os.homedir(), ".codemap", "data")
  );
}

export function buildRepositoryWorkspaceLocation(input: {
  projectId: string;
  importId: string;
}): RepositoryWorkspaceLocation {
  const storageRoot = resolveRepositoryWorkspaceStorageRoot();
  const storageKey = path.posix.join(
    "repos",
    sanitizePathSegment(input.projectId),
    sanitizePathSegment(input.importId),
  );

  return {
    storageRoot,
    storageKey,
    workspacePath: path.join(storageRoot, ...storageKey.split("/")),
  };
}

export function createRepositoryWorkspaceService() {
  return {
    resolveStorageRoot() {
      return resolveRepositoryWorkspaceStorageRoot();
    },

    buildWorkspaceLocation(input: { projectId: string; importId: string }) {
      return buildRepositoryWorkspaceLocation(input);
    },

    async promoteStagedWorkspace(input: {
      projectId: string;
      importId: string;
      stagedWorkspacePath: string;
    }) {
      const location = buildRepositoryWorkspaceLocation(input);

      await mkdir(path.dirname(location.workspacePath), { recursive: true });
      await rm(location.workspacePath, { recursive: true, force: true });

      try {
        await rename(input.stagedWorkspacePath, location.workspacePath);
      } catch (error) {
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          error.code !== "EXDEV"
        ) {
          throw error;
        }

        await cp(input.stagedWorkspacePath, location.workspacePath, {
          recursive: true,
        });
        await rm(input.stagedWorkspacePath, { recursive: true, force: true });
      }

      return location;
    },

    async removeWorkspaceByPath(workspacePath?: string | null) {
      if (!workspacePath?.trim()) {
        return;
      }

      await rm(workspacePath, { recursive: true, force: true });
    },
  };
}
