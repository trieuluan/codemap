import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import type { ProjectSourceImportResult } from "../lib/api-types.js";
import { saveWorkspaceProjectId } from "../lib/workspace-project.js";

export function registerCreateProjectFromGithubTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

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
    withToolError(async ({
      repository_url,
      name,
      description,
      external_repo_id,
      default_branch,
      branch,
    }) => {
      const result = await client.request<ProjectSourceImportResult>(
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

      await saveWorkspaceProjectId(process.cwd(), result.project.id);

      const summary = [
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
        .join("\n");

      return success(summary, {
        project: result.project,
        import: result.import,
        source: {
          provider: "github",
          repositoryUrl: repository_url,
          externalRepoId: external_repo_id ?? null,
          defaultBranch: default_branch ?? null,
          branch: branch ?? null,
        },
        workspaceProjectIdSaved: true,
      });
    }),
  );
}
