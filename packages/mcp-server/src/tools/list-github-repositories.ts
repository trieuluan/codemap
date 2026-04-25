import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import type { GithubRepository } from "../lib/api-types.js";

function formatRepositoryList(repositories: GithubRepository[], heading: string) {
  if (repositories.length === 0) {
    return `${heading}\n\nNo matching repositories found.`;
  }

  return [
    heading,
    "",
    ...repositories.map((repo) =>
      [
        `- ${repo.fullName}`,
        `  URL: ${repo.repositoryUrl}`,
        `  Default branch: ${repo.defaultBranch ?? "unknown"}`,
        `  Visibility: ${repo.private ? "private" : "public"}`,
        `  Repo ID: ${repo.id}`,
      ].join("\n"),
    ),
  ].join("\n");
}

export function registerListGithubRepositoriesTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "list_github_repositories",
    {
      title: "List GitHub Repositories",
      description:
        "Lists repositories accessible through the user's connected GitHub account. " +
        "Use this after check_github_connection reports connected=true.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    withToolError(async ({ limit }) => {
      const repositories = await client.request<GithubRepository[]>(
        "/github/repositories",
        {
          query: { limit: limit ? `${limit}` : undefined },
          authRequired: true,
        },
      );

      return success(
        formatRepositoryList(repositories, "Accessible GitHub repositories:"),
        {
          items: repositories,
          total: repositories.length,
          limit: limit ?? null,
          query: null,
        },
      );
    }),
  );
}

export function registerSearchGithubRepositoriesTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "search_github_repositories",
    {
      title: "Search GitHub Repositories",
      description:
        "Searches repositories accessible through the user's connected GitHub account. " +
        "Use this when the user gives a repo name, owner, or URL fragment.",
      inputSchema: {
        query: z.string().trim().min(1).max(200),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    withToolError(async ({ query, limit }) => {
      const repositories = await client.request<GithubRepository[]>(
        "/github/repositories",
        {
          query: { q: query, limit: limit ? `${limit}` : undefined },
          authRequired: true,
        },
      );

      return success(
        formatRepositoryList(
          repositories,
          `GitHub repositories matching "${query}":`,
        ),
        {
          items: repositories,
          total: repositories.length,
          limit: limit ?? null,
          query,
        },
      );
    }),
  );
}
