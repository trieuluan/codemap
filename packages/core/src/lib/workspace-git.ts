import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CurrentWorkspaceInfo {
  workspacePath: string;
  repoRootPath: string;
  repoName: string;
  branch: string;
  commitSha: string;
  remoteUrl: string | null;
}

async function runGitCommand(cwd: string, args: string[]) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });

  return stdout.trim();
}

/**
 * Like getCurrentWorkspaceInfo but returns null instead of throwing when the
 * current directory is not inside a Git repository or has a detached HEAD.
 * Use this when the caller wants to gracefully handle the no-git case.
 */
export async function tryGetCurrentWorkspaceInfo(
  cwd = process.cwd(),
): Promise<CurrentWorkspaceInfo | null> {
  try {
    return await getCurrentWorkspaceInfo(cwd);
  } catch {
    return null;
  }
}

export async function getCurrentWorkspaceInfo(
  cwd = process.cwd(),
): Promise<CurrentWorkspaceInfo> {
  let repoRootPath: string;

  try {
    repoRootPath = await runGitCommand(cwd, ["rev-parse", "--show-toplevel"]);
  } catch (error) {
    throw new Error(
      `Current workspace is not inside a Git repository. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const [branch, commitSha, remoteUrl] = await Promise.all([
    runGitCommand(repoRootPath, ["rev-parse", "--abbrev-ref", "HEAD"]),
    runGitCommand(repoRootPath, ["rev-parse", "HEAD"]),
    runGitCommand(repoRootPath, ["config", "--get", "remote.origin.url"]).catch(
      () => "",
    ),
  ]);

  if (!branch || branch === "HEAD") {
    throw new Error(
      "Current workspace repository is in a detached HEAD state and cannot be imported as a workspace source.",
    );
  }

  return {
    workspacePath: cwd,
    repoRootPath,
    repoName: path.basename(repoRootPath),
    branch,
    commitSha,
    remoteUrl: remoteUrl || null,
  };
}
