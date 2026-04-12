import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

export interface GithubRepositoryReference {
  owner: string;
  repo: string;
  normalizedUrl: string;
}

export interface MaterializedGithubRepository {
  branch: string;
  reference: GithubRepositoryReference;
  workspacePath: string;
  cleanup: () => Promise<void>;
}

export interface ResolvedGithubRepositorySource {
  branch: string;
  reference: GithubRepositoryReference;
}

function trimGitSuffix(value: string) {
  return value.replace(/\.git$/i, "");
}

export function parseGithubRepositoryUrl(
  repositoryUrl: string,
): GithubRepositoryReference {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(repositoryUrl);
  } catch {
    throw new Error("Repository URL is invalid");
  }

  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "github.com") {
    throw new Error("Only public GitHub repository URLs are supported");
  }

  const segments = parsedUrl.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    throw new Error("GitHub repository URL must include owner and repo");
  }

  const owner = segments[0];
  const repo = trimGitSuffix(segments[1]);

  if (!owner || !repo) {
    throw new Error("GitHub repository URL must include owner and repo");
  }

  return {
    owner,
    repo,
    normalizedUrl: `https://github.com/${owner}/${repo}`,
  };
}

async function runGitCommand(args: string[]) {
  const git = simpleGit().env("GIT_TERMINAL_PROMPT", "0");

  try {
    const stdout = await git.raw(args);

    return {
      stdout,
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message.trim()
    ) {
      throw new Error(error.message.trim());
    }

    throw new Error("Git command failed");
  }
}

export async function resolveGithubDefaultBranch(repositoryUrl: string) {
  const { stdout } = await runGitCommand([
    "ls-remote",
    "--symref",
    repositoryUrl,
    "HEAD",
  ]);

  const headLine = stdout
    .split("\n")
    .find((line) => line.startsWith("ref: refs/heads/"));

  if (!headLine) {
    throw new Error("Unable to resolve the default branch for this repository");
  }

  const match = headLine.match(/^ref: refs\/heads\/(.+)\s+HEAD$/);

  if (!match?.[1]) {
    throw new Error("Unable to resolve the default branch for this repository");
  }

  return match[1].trim();
}

export async function verifyGithubBranchExists(
  repositoryUrl: string,
  branch: string,
) {
  const normalizedBranch = branch.trim();

  if (!normalizedBranch) {
    throw new Error("Branch name is required");
  }

  const { stdout } = await runGitCommand([
    "ls-remote",
    "--heads",
    repositoryUrl,
    normalizedBranch,
  ]);

  if (!stdout.trim()) {
    throw new Error(
      `Branch "${normalizedBranch}" does not exist in this public GitHub repository`,
    );
  }

  return normalizedBranch;
}

export async function resolveGithubRepositorySource(input: {
  repositoryUrl: string;
  preferredBranch?: string | null;
}, options?: {
  verifyBranchExists?: typeof verifyGithubBranchExists;
}) {
  const reference = parseGithubRepositoryUrl(input.repositoryUrl);
  const preferredBranch = input.preferredBranch?.trim();

  if (preferredBranch) {
    const verifyBranchExists =
      options?.verifyBranchExists ?? verifyGithubBranchExists;

    return {
      reference,
      branch: await verifyBranchExists(reference.normalizedUrl, preferredBranch),
    } satisfies ResolvedGithubRepositorySource;
  }

  return {
    reference,
    branch: await resolveGithubDefaultBranch(reference.normalizedUrl),
  } satisfies ResolvedGithubRepositorySource;
}

export async function materializeGithubRepositorySource(
  source: ResolvedGithubRepositorySource,
) {
  const git = simpleGit().env("GIT_TERMINAL_PROMPT", "0");
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "codemap-project-import-"),
  );
  const workspacePath = path.join(workspaceRoot, source.reference.repo);

  try {
    await git.clone(source.reference.normalizedUrl, workspacePath, [
      "--depth",
      "1",
      "--single-branch",
      "--branch",
      source.branch,
    ]);
  } catch (error) {
    await rm(workspaceRoot, { recursive: true, force: true });

    if (error instanceof Error && error.message) {
      throw new Error(
        `Unable to download public GitHub repository source: ${error.message}`.slice(
          0,
          500,
        ),
      );
    }

    throw error;
  }

  return {
    branch: source.branch,
    reference: source.reference,
    workspacePath,
    cleanup: async () => {
      await rm(workspaceRoot, { recursive: true, force: true });
    },
  } satisfies MaterializedGithubRepository;
}
