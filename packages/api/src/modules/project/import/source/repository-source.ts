import {
  type ResolvedGithubRepositorySource,
  materializeGithubRepositorySource,
  parseGithubRepositoryUrl,
  resolveGithubRepositorySource,
} from "./github-source";
import {
  type ResolvedGitlabRepositorySource,
  materializeGitlabRepositorySource,
  parseGitlabRepositoryUrl,
  resolveGitlabRepositorySource,
} from "./gitlab-source";
import {
  type ResolvedLocalWorkspaceSource,
  materializeLocalWorkspaceSource,
  resolveLocalWorkspaceSource,
  validateLocalWorkspaceSourceAccess,
} from "./local-workspace-source";

type GithubRepositorySourceInput = {
  provider: "github";
  repositoryUrl: string;
  preferredBranch?: string | null;
  accessToken?: string | null;
};

type GitlabRepositorySourceInput = {
  provider: "gitlab";
  repositoryUrl: string;
  preferredBranch?: string | null;
  accessToken?: string | null;
};

type LocalWorkspaceSourceInput = {
  provider: "local_workspace";
  workspacePath: string;
  preferredBranch?: string | null;
};

type RepositorySourceInput =
  | GithubRepositorySourceInput
  | GitlabRepositorySourceInput
  | LocalWorkspaceSourceInput;

function isResolvedLocalWorkspaceSource(
  source: Awaited<ReturnType<typeof resolveRepositorySource>>,
): source is ResolvedLocalWorkspaceSource {
  return "workspacePath" in source.reference;
}

function isResolvedGithubRepositorySource(
  source: Awaited<ReturnType<typeof resolveRepositorySource>>,
): source is ResolvedGithubRepositorySource {
  return "owner" in source.reference;
}

function isResolvedGitlabRepositorySource(
  source: Awaited<ReturnType<typeof resolveRepositorySource>>,
): source is ResolvedGitlabRepositorySource {
  return "host" in source.reference;
}

export async function validateRepositorySourceAccess(input: RepositorySourceInput) {
  if (input.provider === "github") {
    parseGithubRepositoryUrl(input.repositoryUrl);
    return;
  }

  if (input.provider === "gitlab") {
    parseGitlabRepositoryUrl(input.repositoryUrl);
    return;
  }

  await validateLocalWorkspaceSourceAccess(input.workspacePath);
}

export async function resolveRepositorySource(input: RepositorySourceInput) {
  if (input.provider === "github") {
    return resolveGithubRepositorySource({
      repositoryUrl: input.repositoryUrl,
      preferredBranch: input.preferredBranch,
      accessToken: input.accessToken,
    });
  }

  if (input.provider === "gitlab") {
    return resolveGitlabRepositorySource({
      repositoryUrl: input.repositoryUrl,
      preferredBranch: input.preferredBranch,
      accessToken: input.accessToken,
    });
  }

  return resolveLocalWorkspaceSource({
    workspacePath: input.workspacePath,
  });
}

export async function materializeRepositorySource(
  source: Awaited<ReturnType<typeof resolveRepositorySource>>,
  options?: {
    accessToken?: string | null;
  },
) {
  if (isResolvedLocalWorkspaceSource(source)) {
    return materializeLocalWorkspaceSource(source);
  }

  if (isResolvedGithubRepositorySource(source)) {
    return materializeGithubRepositorySource(source, options);
  }

  if (isResolvedGitlabRepositorySource(source)) {
    return materializeGitlabRepositorySource(source, options);
  }

  throw new Error("Unsupported repository source type");
}
