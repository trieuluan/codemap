import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { requestCodeMapApi, toToolErrorContent } from "../lib/codemap-api.js";

interface ProjectSummary {
  id: string;
  name: string;
  provider: "github" | "local_workspace" | null;
  repositoryUrl: string | null;
}

interface ProjectImportSummary {
  id: string;
  status: string;
  branch: string | null;
  parseStatus: string;
}

interface ProjectSourceImportResult {
  project: ProjectSummary;
  import: ProjectImportSummary;
}

export function registerCreateProjectFromGithubTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "create_project_from_github",
    {
      title: "Create Project From GitHub",
      description:
        "Creates or reuses a CodeMap project from a GitHub repository, then starts import and parse automatically. " +
        "Use this after the user picks a repo from list_github_repositories or search_github_repositories.",
      inputSchema: {
        repository_url: z.string().trim().url().max(500),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().min(1).max(500).optional(),
        external_repo_id: z.string().trim().min(1).max(255).optional(),
        default_branch: z.string().trim().min(1).max(255).optional(),
        branch: z.string().trim().min(1).max(255).optional(),
      },
    },
    async ({
      repository_url,
      name,
      description,
      external_repo_id,
      default_branch,
      branch,
    }) => {
      try {
        const result = await requestCodeMapApi<ProjectSourceImportResult>(
          config,
          "/projects/from-github",
          {
            method: "POST",
            body: {
              repositoryUrl: repository_url,
              name,
              description,
              externalRepoId: external_repo_id,
              defaultBranch: default_branch,
              branch,
            },
            authRequired: true,
          },
        );

        return {
          content: [
            {
              type: "text",
              text: [
                "GitHub source project import started successfully.",
                `Project: ${result.project.name} (${result.project.id})`,
                `Provider: ${result.project.provider ?? "unknown"}`,
                result.project.repositoryUrl
                  ? `Repository: ${result.project.repositoryUrl}`
                  : null,
                `Import: ${result.import.id}`,
                `Branch: ${result.import.branch ?? default_branch ?? "default"}`,
                `Import status: ${result.import.status}`,
                `Parse status: ${result.import.parseStatus}`,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        };
      } catch (error) {
        return toToolErrorContent(error);
      }
    },
  );
}
