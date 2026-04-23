import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { requestCodeMapApi, toToolErrorContent } from "../lib/codemap-api.js";

interface GithubRepositoryOption {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
  defaultBranch: string | null;
  private: boolean;
  repositoryUrl: string;
}

function formatRepositoryList(
  repositories: GithubRepositoryOption[],
  heading: string,
) {
  if (repositories.length === 0) {
    return `${heading}\n\nNo matching repositories found.`;
  }

  return [
    heading,
    "",
    ...repositories.map((repository) =>
      [
        `- ${repository.fullName}`,
        `  URL: ${repository.repositoryUrl}`,
        `  Default branch: ${repository.defaultBranch ?? "unknown"}`,
        `  Visibility: ${repository.private ? "private" : "public"}`,
        `  Repo ID: ${repository.id}`,
      ].join("\n"),
    ),
  ].join("\n");
}

export function registerListGithubRepositoriesTool(
  server: McpServer,
  config: McpServerConfig,
) {
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
    async ({ limit }) => {
      try {
        const repositories = await requestCodeMapApi<GithubRepositoryOption[]>(
          config,
          "/github/repositories",
          {
            query: {
              limit: limit ? `${limit}` : undefined,
            },
            authRequired: true,
          },
        );

        return {
          content: [
            {
              type: "text",
              text: formatRepositoryList(
                repositories,
                "Accessible GitHub repositories:",
              ),
            },
          ],
        };
      } catch (error) {
        return toToolErrorContent(error);
      }
    },
  );
}

export function registerSearchGithubRepositoriesTool(
  server: McpServer,
  config: McpServerConfig,
) {
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
    async ({ query, limit }) => {
      try {
        const repositories = await requestCodeMapApi<GithubRepositoryOption[]>(
          config,
          "/github/repositories",
          {
            query: {
              q: query,
              limit: limit ? `${limit}` : undefined,
            },
            authRequired: true,
          },
        );

        return {
          content: [
            {
              type: "text",
              text: formatRepositoryList(
                repositories,
                `GitHub repositories matching "${query}":`,
              ),
            },
          ],
        };
      } catch (error) {
        return toToolErrorContent(error);
      }
    },
  );
}
