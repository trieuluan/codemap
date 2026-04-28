import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import type { ProjectSourceImportResult } from "../lib/api-types.js";
import { saveWorkspaceProjectId } from "../lib/workspace-project.js";
import { resolveWorkspace } from "../lib/workspace-resolver.js";

export function registerCreateProjectFromGitlabTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "create_project_from_gitlab",
    {
      title: "Create Project From GitLab",
      description:
        "Creates or reuses a CodeMap project from a GitLab repository (gitlab.com or self-hosted), " +
        "then starts import and parse automatically. " +
        "Provide the full HTTPS repository URL and optionally a personal access token for private repos. " +
        "For self-hosted GitLab, include the full host in the URL (e.g. https://gitlab.mycompany.com/group/repo).",
      inputSchema: {
        repository_url: z.string().trim().url().max(500).describe(
          "Full HTTPS URL of the GitLab repository, e.g. https://gitlab.com/group/repo or https://gitlab.mycompany.com/group/repo",
        ),
        access_token: z.string().trim().min(1).max(500).optional().describe(
          "Personal access token with read_repository scope. Required for private repositories.",
        ),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().min(1).max(500).optional(),
        default_branch: z.string().trim().min(1).max(255).optional(),
        branch: z.string().trim().min(1).max(255).optional(),
      },
    },
    withToolError(async ({
      repository_url,
      access_token,
      name,
      description,
      default_branch,
      branch,
    }) => {
      const result = await client.request<ProjectSourceImportResult>(
        "/projects/from-gitlab",
        {
          method: "POST",
          body: {
            repositoryUrl: repository_url,
            accessToken: access_token,
            name,
            description,
            defaultBranch: default_branch,
            branch,
          },
          authRequired: true,
        },
      );

      const resolvedWorkspace = await resolveWorkspace({ project: result.project });
      await saveWorkspaceProjectId(
        resolvedWorkspace.workspaceRootPath,
        result.project.id,
      );

      const summary = [
        "GitLab source project import started successfully.",
        `Project: ${result.project.name} (${result.project.id})`,
        `Provider: ${result.project.provider ?? "unknown"}`,
        result.project.repositoryUrl
          ? `Repository: ${result.project.repositoryUrl}`
          : null,
        `Import: ${result.import.id}`,
        `Branch: ${result.import.branch ?? default_branch ?? "default"}`,
        `Import status: ${result.import.status}`,
        `Parse status: ${result.import.parseStatus}`,
        "Next action: call wait_for_import until indexing is ready.",
      ]
        .filter(Boolean)
        .join("\n");

      return success(summary, {
        project: result.project,
        import: result.import,
        source: {
          provider: "gitlab",
          repositoryUrl: repository_url,
          defaultBranch: default_branch ?? null,
          branch: branch ?? null,
        },
        workspaceProjectIdSaved: true,
        nextAction: "wait_for_import",
      });
    }),
  );
}
