import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import type { GithubRepository, GitlabRepository } from "../lib/api-types.js";

type Repository = (GithubRepository | GitlabRepository) & { provider: "github" | "gitlab" };

function formatRepositoryList(repositories: Repository[], heading: string) {
  if (repositories.length === 0) {
    return `${heading}\n\nNo matching repositories found.`;
  }

  return [
    heading,
    "",
    ...repositories.map((repo) =>
      [
        `- ${repo.fullName} [${repo.provider.toUpperCase()}]`,
        `  URL: ${repo.repositoryUrl}`,
        `  Default branch: ${repo.defaultBranch ?? "unknown"}`,
        `  Visibility: ${repo.private ? "private" : "public"}`,
        `  Repo ID: ${repo.id}`,
      ].join("\n"),
    ),
  ].join("\n");
}

export function registerListRepositoriesTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "list_repositories",
    {
      title: "List Git Repositories",
      description:
        "Lists repositories accessible through the user's connected GitHub and/or GitLab accounts. " +
        "Optionally pass a query to search by repo name, owner, or URL fragment. " +
        "Optionally specify a provider (github, gitlab, or both). " +
        "Use this after manage_git_connection(provider='github'|'gitlab', action='check') reports connected=true.",
      inputSchema: {
        provider: z.enum(["github", "gitlab", "both"]).optional().default("both").describe(
          "Which provider(s) to list repositories from. Defaults to 'both'.",
        ),
        query: z.string().trim().min(1).max(200).optional().describe(
          "Optional search filter — repo name, owner, or URL fragment. Omit to list all repositories.",
        ),
        limit: z.number().int().min(1).max(100).optional().describe(
          "Maximum number of repositories to return per provider. Defaults to no limit.",
        ),
      },
    },
    withToolError(async ({ provider = "both", query, limit }) => {
      const repositories: Repository[] = [];

      const queryParams: Record<string, string | undefined> = {
        limit: limit ? `${limit}` : undefined,
      };
      if (query) queryParams.q = query;

      // Fetch from GitHub if provider is "github" or "both"
      if (provider === "github" || provider === "both") {
        try {
          const githubRepos = await client.request<GithubRepository[]>(
            "/github/repositories",
            {
              query: queryParams,
              authRequired: true,
            },
          );
          repositories.push(
            ...githubRepos.map((repo) => ({ ...repo, provider: "github" as const })),
          );
        } catch (error) {
          // If GitHub is not connected, skip it
          if (!(error instanceof Error && error.message.includes("401"))) {
            throw error;
          }
        }
      }

      // Fetch from GitLab if provider is "gitlab" or "both"
      if (provider === "gitlab" || provider === "both") {
        try {
          const gitlabRepos = await client.request<GitlabRepository[]>(
            "/gitlab/repositories",
            {
              query: queryParams,
              authRequired: true,
            },
          );
          repositories.push(
            ...gitlabRepos.map((repo) => ({ ...repo, provider: "gitlab" as const })),
          );
        } catch (error) {
          // If GitLab is not connected, skip it
          if (!(error instanceof Error && error.message.includes("401"))) {
            throw error;
          }
        }
      }

      if (repositories.length === 0 && provider === "both") {
        return success(
          "No connected Git providers found. Use manage_git_connection to connect GitHub and/or GitLab.",
          {
            items: [],
            total: 0,
            limit: limit ?? null,
            query: query ?? null,
            provider,
          },
        );
      }

      const heading = query
        ? `${provider === "both" ? "Git" : provider.charAt(0).toUpperCase() + provider.slice(1)} repositories matching "${query}":`
        : `Accessible ${provider === "both" ? "Git" : provider} repositories:`;

      return success(
        formatRepositoryList(repositories, heading),
        {
          items: repositories,
          total: repositories.length,
          limit: limit ?? null,
          query: query ?? null,
          provider,
        },
      );
    }),
  );
}
