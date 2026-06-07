import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Convert SSH git remote URLs to HTTPS for API compatibility.
 * Handles: git@github.com:user/repo.git, ssh://git@github.com/user/repo.git
 */
function normalizeRemoteUrl(url: string): string {
  // git@host:user/repo.git → https://host/user/repo
  const sshMatch = /^git@([^:]+):(.+?)(?:\.git)?$/i.exec(url);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2].replace(/\.git$/i, "")}`;
  }

  // ssh://git@host/user/repo.git → https://host/user/repo
  const sshProtoMatch = /^ssh:\/\/git@([^/]+)\/(.+?)(?:\.git)?$/i.exec(url);
  if (sshProtoMatch) {
    return `https://${sshProtoMatch[1]}/${sshProtoMatch[2].replace(/\.git$/i, "")}`;
  }

  return url;
}

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
    remoteUrl: remoteUrl ? normalizeRemoteUrl(remoteUrl) : null,
  };
}
