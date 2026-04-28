import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

export interface GitlabRepositoryReference {
  host: string;
  namespace: string;
  repo: string;
  normalizedUrl: string;
}

export interface ResolvedGitlabRepositorySource {
  branch: string;
  reference: GitlabRepositoryReference;
}

export interface MaterializedGitlabRepository {
  branch: string;
  commitSha: string;
  reference: GitlabRepositoryReference;
  workspacePath: string;
  cleanup: () => Promise<void>;
}

function trimGitSuffix(value: string) {
  return value.replace(/\.git$/i, "");
}

async function getGitHeadCommitSha(workspacePath: string) {
  const git = simpleGit(workspacePath).env("GIT_TERMINAL_PROMPT", "0");
  try {
    return (await git.revparse(["HEAD"])).trim();
  } catch (error) {
    throw new Error(
      `Unable to resolve repository commit SHA: ${error instanceof Error ? error.message.trim() : "unknown"}`,
    );
  }
}

async function runGitCommand(args: string[]) {
  const git = simpleGit().env("GIT_TERMINAL_PROMPT", "0");
  try {
    return { stdout: await git.raw(args) };
  } catch (error) {
    throw new Error(
      error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
        ? error.message.trim()
        : "Git command failed",
    );
  }
}

export function parseGitlabRepositoryUrl(
  repositoryUrl: string,
): GitlabRepositoryReference {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(repositoryUrl);
  } catch {
    throw new Error("Repository URL is invalid");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTPS GitLab repository URLs are supported");
  }

  const segments = parsedUrl.pathname
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    throw new Error("GitLab repository URL must include namespace and repo");
  }

  // Support nested namespaces: gitlab.com/group/subgroup/repo
  const repo = trimGitSuffix(segments[segments.length - 1]!);
  const namespace = segments.slice(0, -1).join("/");

  if (!namespace || !repo) {
    throw new Error("GitLab repository URL must include namespace and repo");
  }

  const host = parsedUrl.hostname;
  const normalizedUrl = `https://${host}/${namespace}/${repo}`;

  return { host, namespace, repo, normalizedUrl };
}

function buildGitlabApiBase(host: string) {
  return `https://${host}/api/v4`;
}

function buildGitlabApiHeaders(
  accessToken?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  return headers;
}

function buildGitlabCloneUrl(
  reference: GitlabRepositoryReference,
  accessToken?: string | null,
): string {
  if (!accessToken) return reference.normalizedUrl;
  return `https://oauth2:${encodeURIComponent(accessToken)}@${reference.host}/${reference.namespace}/${reference.repo}.git`;
}

function encodeGitlabProjectPath(namespace: string, repo: string) {
  return encodeURIComponent(`${namespace}/${repo}`);
}

export async function resolveGitlabDefaultBranch(
  reference: GitlabRepositoryReference,
  accessToken?: string | null,
): Promise<string> {
  if (accessToken) {
    const response = await fetch(
      `${buildGitlabApiBase(reference.host)}/projects/${encodeGitlabProjectPath(reference.namespace, reference.repo)}`,
      { headers: buildGitlabApiHeaders(accessToken) },
    );

    if (response.status === 404)
      throw new Error("Unable to access this GitLab repository");
    if (!response.ok)
      throw new Error(
        `Unable to resolve the default branch for this repository (${response.status})`,
      );

    const data = (await response.json()) as { default_branch?: string | null };
    const defaultBranch = data.default_branch?.trim();
    if (!defaultBranch)
      throw new Error(
        "Unable to resolve the default branch for this repository",
      );
    return defaultBranch;
  }

  const { stdout } = await runGitCommand([
    "ls-remote",
    "--symref",
    reference.normalizedUrl,
    "HEAD",
  ]);
  const headLine = stdout
    .split("\n")
    .find((line) => line.startsWith("ref: refs/heads/"));
  if (!headLine)
    throw new Error("Unable to resolve the default branch for this repository");
  const match = headLine.match(/^ref: refs\/heads\/(.+)\s+HEAD$/);
  if (!match?.[1])
    throw new Error("Unable to resolve the default branch for this repository");
  return match[1].trim();
}

export async function verifyGitlabBranchExists(
  reference: GitlabRepositoryReference,
  branch: string,
  accessToken?: string | null,
): Promise<string> {
  const normalizedBranch = branch.trim();
  if (!normalizedBranch) throw new Error("Branch name is required");

  if (accessToken) {
    const response = await fetch(
      `${buildGitlabApiBase(reference.host)}/projects/${encodeGitlabProjectPath(reference.namespace, reference.repo)}/repository/branches/${encodeURIComponent(normalizedBranch)}`,
      { headers: buildGitlabApiHeaders(accessToken) },
    );

    if (response.status === 404)
      throw new Error(
        `Branch "${normalizedBranch}" does not exist in this GitLab repository`,
      );
    if (!response.ok)
      throw new Error(
        `Unable to verify branch "${normalizedBranch}" for this GitLab repository (${response.status})`,
      );
    return normalizedBranch;
  }

  const { stdout } = await runGitCommand([
    "ls-remote",
    "--heads",
    reference.normalizedUrl,
    normalizedBranch,
  ]);
  if (!stdout.trim())
    throw new Error(
      `Branch "${normalizedBranch}" does not exist in this GitLab repository`,
    );
  return normalizedBranch;
}

export async function resolveGitlabRepositorySource(input: {
  repositoryUrl: string;
  preferredBranch?: string | null;
  accessToken?: string | null;
}): Promise<ResolvedGitlabRepositorySource> {
  const reference = parseGitlabRepositoryUrl(input.repositoryUrl);
  const preferredBranch = input.preferredBranch?.trim();

  const branch = preferredBranch
    ? await verifyGitlabBranchExists(
        reference,
        preferredBranch,
        input.accessToken,
      )
    : await resolveGitlabDefaultBranch(reference, input.accessToken);

  return { reference, branch };
}

export async function materializeGitlabRepositorySource(
  source: ResolvedGitlabRepositorySource,
  options?: { accessToken?: string | null },
): Promise<MaterializedGitlabRepository> {
  const git = simpleGit().env("GIT_TERMINAL_PROMPT", "0");
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "codemap-project-import-"),
  );
  const workspacePath = path.join(workspaceRoot, source.reference.repo);

  try {
    await git.clone(
      buildGitlabCloneUrl(source.reference, options?.accessToken),
      workspacePath,
      ["--depth", "1", "--single-branch", "--branch", source.branch],
    );
  } catch (error) {
    await rm(workspaceRoot, { recursive: true, force: true });
    throw new Error(
      `Unable to clone GitLab repository: ${error instanceof Error ? error.message : "unknown error"}`.slice(
        0,
        500,
      ),
    );
  }

  const commitSha = await getGitHeadCommitSha(workspacePath);

  return {
    branch: source.branch,
    commitSha,
    reference: source.reference,
    workspacePath,
    cleanup: async () => rm(workspaceRoot, { recursive: true, force: true }),
  };
}
