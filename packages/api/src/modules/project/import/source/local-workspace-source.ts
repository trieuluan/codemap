import { cp, mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

export interface LocalWorkspaceReference {
  workspacePath: string;
  repoName: string;
}

export interface ResolvedLocalWorkspaceSource {
  branch: string;
  commitSha: string;
  reference: LocalWorkspaceReference;
}

export interface MaterializedLocalWorkspaceSource {
  branch: string;
  commitSha: string;
  reference: LocalWorkspaceReference;
  workspacePath: string;
  cleanup: () => Promise<void>;
}

const IGNORED_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
]);

function parseAllowedWorkspaceRoots() {
  const rawValue = process.env.CODEMAP_ALLOWED_WORKSPACE_ROOTS?.trim();

  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => path.resolve(value));
}

function ensurePathWithinAllowedRoots(targetPath: string) {
  const allowedRoots = parseAllowedWorkspaceRoots();

  if (allowedRoots.length === 0) {
    return;
  }

  const normalizedTargetPath = path.resolve(targetPath);
  const isAllowed = allowedRoots.some((allowedRoot) => {
    const relativePath = path.relative(allowedRoot, normalizedTargetPath);

    return (
      relativePath === "" ||
      (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
    );
  });

  if (!isAllowed) {
    throw new Error("Workspace path is outside the allowed workspace roots");
  }
}

async function requireDirectory(workspacePath: string) {
  let workspaceStats;

  try {
    workspaceStats = await stat(workspacePath);
  } catch {
    throw new Error("Workspace path does not exist");
  }

  if (!workspaceStats.isDirectory()) {
    throw new Error("Workspace path must point to a directory");
  }
}

async function resolveGitRepoRoot(workspacePath: string) {
  const git = simpleGit(workspacePath).env("GIT_TERMINAL_PROMPT", "0");

  try {
    const rootPath = await git.revparse(["--show-toplevel"]);
    return path.resolve(rootPath.trim());
  } catch (error) {
    if (error instanceof Error && error.message.trim()) {
      throw new Error(
        `Workspace source must be a Git repository: ${error.message.trim()}`,
      );
    }

    throw new Error("Workspace source must be a Git repository");
  }
}

async function resolveCurrentBranch(workspacePath: string) {
  const git = simpleGit(workspacePath).env("GIT_TERMINAL_PROMPT", "0");

  try {
    const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
    const normalizedBranch = branch.trim();

    if (!normalizedBranch || normalizedBranch === "HEAD") {
      throw new Error("Repository is in a detached HEAD state");
    }

    return normalizedBranch;
  } catch (error) {
    if (error instanceof Error && error.message.trim()) {
      throw new Error(`Unable to resolve workspace branch: ${error.message.trim()}`);
    }

    throw new Error("Unable to resolve workspace branch");
  }
}

async function resolveHeadCommitSha(workspacePath: string) {
  const git = simpleGit(workspacePath).env("GIT_TERMINAL_PROMPT", "0");

  try {
    const commitSha = await git.revparse(["HEAD"]);
    const normalizedCommitSha = commitSha.trim();

    if (!normalizedCommitSha) {
      throw new Error("Repository does not have a HEAD commit");
    }

    return normalizedCommitSha;
  } catch (error) {
    if (error instanceof Error && error.message.trim()) {
      throw new Error(
        `Unable to resolve workspace commit SHA: ${error.message.trim()}`,
      );
    }

    throw new Error("Unable to resolve workspace commit SHA");
  }
}

export async function validateLocalWorkspaceSourceAccess(workspacePath: string) {
  const normalizedWorkspacePath = path.resolve(workspacePath);
  ensurePathWithinAllowedRoots(normalizedWorkspacePath);
  await requireDirectory(normalizedWorkspacePath);
  await resolveGitRepoRoot(normalizedWorkspacePath);
}

export async function resolveLocalWorkspaceSource(input: {
  workspacePath: string;
}) {
  const normalizedWorkspacePath = path.resolve(input.workspacePath);
  await validateLocalWorkspaceSourceAccess(normalizedWorkspacePath);

  const repoRootPath = await resolveGitRepoRoot(normalizedWorkspacePath);
  const branch = await resolveCurrentBranch(repoRootPath);
  const commitSha = await resolveHeadCommitSha(repoRootPath);

  return {
    branch,
    commitSha,
    reference: {
      workspacePath: repoRootPath,
      repoName: path.basename(repoRootPath),
    },
  } satisfies ResolvedLocalWorkspaceSource;
}

export async function materializeLocalWorkspaceSource(
  source: ResolvedLocalWorkspaceSource,
) {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "codemap-workspace-import-"),
  );
  const workspacePath = path.join(workspaceRoot, source.reference.repoName);

  try {
    await cp(source.reference.workspacePath, workspacePath, {
      recursive: true,
      force: true,
      filter: (sourcePath) => {
        const name = path.basename(sourcePath);
        return !IGNORED_NAMES.has(name);
      },
    });
  } catch (error) {
    await rm(workspaceRoot, { recursive: true, force: true });

    if (error instanceof Error && error.message.trim()) {
      throw new Error(
        `Unable to copy workspace source into managed storage: ${error.message.trim()}`.slice(
          0,
          500,
        ),
      );
    }

    throw error;
  }

  return {
    branch: source.branch,
    commitSha: source.commitSha,
    reference: source.reference,
    workspacePath,
    cleanup: async () => {
      await rm(workspaceRoot, { recursive: true, force: true });
    },
  } satisfies MaterializedLocalWorkspaceSource;
}
