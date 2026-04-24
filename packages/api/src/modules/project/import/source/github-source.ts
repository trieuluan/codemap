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
  commitSha: string;
  reference: GithubRepositoryReference;
  workspacePath: string;
  cleanup: () => Promise<void>;
}

export interface ResolvedGithubRepositorySource {
  branch: string;
  reference: GithubRepositoryReference;
}

async function getGitHeadCommitSha(workspacePath: string) {
  const git = simpleGit(workspacePath).env("GIT_TERMINAL_PROMPT", "0");

  try {
    const commitSha = await git.revparse(["HEAD"]);

    return commitSha.trim();
  } catch (error) {
    if (error instanceof Error && error.message.trim()) {
      throw new Error(`Unable to resolve repository commit SHA: ${error.message.trim()}`);
    }

    throw new Error("Unable to resolve repository commit SHA");
  }
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
    throw new Error("Only GitHub repository URLs are supported");
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

function buildGitHubApiHeaders(accessToken?: string | null) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

function buildGithubCloneUrl(
  reference: GithubRepositoryReference,
  accessToken?: string | null,
) {
  if (!accessToken) {
    return reference.normalizedUrl;
  }

  return `https://x-access-token:${encodeURIComponent(accessToken)}@github.com/${reference.owner}/${reference.repo}.git`;
}

export async function resolveGithubDefaultBranch(
  repositoryUrl: string,
  accessToken?: string | null,
) {
  if (accessToken) {
    const reference = parseGithubRepositoryUrl(repositoryUrl);
    const response = await fetch(
      `https://api.github.com/repos/${reference.owner}/${reference.repo}`,
      {
        headers: buildGitHubApiHeaders(accessToken),
      },
    );

    if (response.status === 404) {
      throw new Error("Unable to access this GitHub repository");
    }

    if (!response.ok) {
      throw new Error(
        `Unable to resolve the default branch for this repository (${response.status})`,
      );
    }

    const data = (await response.json()) as { default_branch?: string | null };
    const defaultBranch = data.default_branch?.trim();

    if (!defaultBranch) {
      throw new Error("Unable to resolve the default branch for this repository");
    }

    return defaultBranch;
  }

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
  accessToken?: string | null,
) {
  const normalizedBranch = branch.trim();

  if (!normalizedBranch) {
    throw new Error("Branch name is required");
  }

  if (accessToken) {
    const reference = parseGithubRepositoryUrl(repositoryUrl);
    const response = await fetch(
      `https://api.github.com/repos/${reference.owner}/${reference.repo}/branches/${encodeURIComponent(normalizedBranch)}`,
      {
        headers: buildGitHubApiHeaders(accessToken),
      },
    );

    if (response.status === 404) {
      throw new Error(
        `Branch "${normalizedBranch}" does not exist in this GitHub repository`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Unable to verify branch "${normalizedBranch}" for this GitHub repository (${response.status})`,
      );
    }

    return normalizedBranch;
  }

  const { stdout } = await runGitCommand([
    "ls-remote",
    "--heads",
    repositoryUrl,
    normalizedBranch,
  ]);

  if (!stdout.trim()) {
    throw new Error(
      `Branch "${normalizedBranch}" does not exist in this GitHub repository`,
    );
  }

  return normalizedBranch;
}

export async function resolveGithubRepositorySource(input: {
  repositoryUrl: string;
  preferredBranch?: string | null;
  accessToken?: string | null;
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
      branch: await verifyBranchExists(
        reference.normalizedUrl,
        preferredBranch,
        input.accessToken,
      ),
    } satisfies ResolvedGithubRepositorySource;
  }

  return {
    reference,
    branch: await resolveGithubDefaultBranch(
      reference.normalizedUrl,
      input.accessToken,
    ),
  } satisfies ResolvedGithubRepositorySource;
}

export async function materializeGithubRepositorySource(
  source: ResolvedGithubRepositorySource,
  options?: {
    accessToken?: string | null;
  },
) {
  const git = simpleGit().env("GIT_TERMINAL_PROMPT", "0");
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "codemap-project-import-"),
  );
  const workspacePath = path.join(workspaceRoot, source.reference.repo);

  try {
    await git.clone(
      buildGithubCloneUrl(source.reference, options?.accessToken),
      workspacePath,
      [
      "--depth",
      "100",
      "--single-branch",
      "--branch",
      source.branch,
      ],
    );
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

  const commitSha = await getGitHeadCommitSha(workspacePath);

  return {
    branch: source.branch,
    commitSha,
    reference: source.reference,
    workspacePath,
    cleanup: async () => {
      await rm(workspaceRoot, { recursive: true, force: true });
    },
  } satisfies MaterializedGithubRepository;
}
