import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
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

      // Also remove the parent {projectId} folder if it's now empty
      const parentDir = path.dirname(workspacePath);
      try {
        const entries = await readdir(parentDir);
        if (entries.length === 0) {
          await rm(parentDir, { recursive: true, force: true });
        }
      } catch {
        // Parent doesn't exist or can't be read — ignore
      }
    },
  };
}
