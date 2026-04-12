import {
  materializeGithubRepositorySource,
  parseGithubRepositoryUrl,
  resolveGithubRepositorySource,
} from "./github-source";

export async function validateRepositorySourceAccess(repositoryUrl: string) {
  parseGithubRepositoryUrl(repositoryUrl);
}

export async function resolveRepositorySource(input: {
  repositoryUrl: string;
  preferredBranch?: string | null;
}) {
  return resolveGithubRepositorySource(input);
}

export async function materializeRepositorySource(
  source: Awaited<ReturnType<typeof resolveRepositorySource>>,
) {
  return materializeGithubRepositorySource(source);
}
