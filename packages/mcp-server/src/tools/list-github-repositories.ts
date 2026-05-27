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
        "Optionally pass a query to search by repo name, owner, or URL fragment. " +
        "Use this after manage_git_connection(provider='github', action='check') reports connected=true.",
      inputSchema: {
        query: z.string().trim().min(1).max(200).optional().describe(
          "Optional search filter — repo name, owner, or URL fragment. Omit to list all repositories.",
        ),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    withToolError(async ({ query, limit }) => {
      const queryParams: Record<string, string | undefined> = {
        limit: limit ? `${limit}` : undefined,
      };
      if (query) queryParams.q = query;

      const repositories = await client.request<GithubRepository[]>(
        "/github/repositories",
        {
          query: queryParams,
          authRequired: true,
        },
      );

      const heading = query
        ? `GitHub repositories matching "${query}":`
        : "Accessible GitHub repositories:";

      return success(
        formatRepositoryList(repositories, heading),
        {
          items: repositories,
          total: repositories.length,
          limit: limit ?? null,
          query: query ?? null,
        },
      );
    }),
  );
}
