import { z } from "zod";
import { uuidSchema } from "../lib/uuid-schema.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import type { ProjectSourceImportResult } from "../lib/api-types.js";
import { saveWorkspaceProjectId, readWorkspaceProjectId } from "../lib/workspace-project.js";
import { resolveWorkspace } from "../lib/workspace-resolver.js";

type CodeMapClient = ReturnType<typeof createCodeMapClient>;

export type CreateGithubProjectParams = {
  repository_url: string;
  name?: string;
  description?: string;
  external_repo_id?: string;
  default_branch?: string;
  branch?: string;
  workspace_id?: string;
  is_private?: boolean;
};

/**
 * Core logic for creating a project from a GitHub repository.
 * Extracted so `create_project` can delegate here without duplicating API calls.
 */
export async function createGithubProject(
  client: CodeMapClient,
  params: CreateGithubProjectParams,
) {
  const { repository_url, name, description, external_repo_id, default_branch, branch, workspace_id, is_private } = params;

  const existingProjectId = await readWorkspaceProjectId();
  if (existingProjectId) {
    return {
      alreadyLinked: true as const,
      projectId: existingProjectId,
    };
  }

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
        workspaceId: workspace_id,
        isPrivate: is_private,
      },
      authRequired: true,
    },
  );

  const resolvedWorkspace = await resolveWorkspace({ project: result.project });
  await saveWorkspaceProjectId(
    resolvedWorkspace.workspaceRootPath,
    result.project.id,
  );

  return {
    alreadyLinked: false as const,
    project: result.project,
    import: result.import,
    source: {
      provider: "github" as const,
      repositoryUrl: repository_url,
      externalRepoId: external_repo_id ?? null,
      defaultBranch: default_branch ?? null,
      branch: branch ?? null,
      workspaceId: workspace_id ?? null,
    },
  };
}

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
        "Use this after the user picks a repo from list_github_repositories.",
      inputSchema: {
        repository_url: z.string().trim().url().max(500),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().min(1).max(500).optional(),
        external_repo_id: z.string().trim().min(1).max(255).optional(),
        default_branch: z.string().trim().min(1).max(255).optional(),
        branch: z.string().trim().min(1).max(255).optional(),
        workspace_id: uuidSchema
          .optional()
          .describe(
            "Optional CodeMap workspace UUID. If omitted, CodeMap uses the user's default personal workspace.",
          ),
        is_private: z
          .boolean()
          .optional()
          .describe(
            "Whether the repository is private. Pass the 'private' field from list_github_repositories. Enforces privateRepoImports entitlement.",
          ),
      },
    },
    withToolError(async (params) => {
      const result = await createGithubProject(client, params);

      if (result.alreadyLinked) {
        return success(
          `This workspace is already linked to CodeMap project \`${result.projectId}\`.\n` +
          `Use \`reimport\` to re-sync the existing project instead.\n` +
          `Do NOT call create_project_from_github again — it would overwrite the existing project link.`,
          { projectId: result.projectId },
        );
      }

      const summary = [
        "GitHub source project import started successfully.",
        `Project: ${result.project.name} (${result.project.id})`,
        `Provider: ${result.project.provider ?? "unknown"}`,
        result.project.repositoryUrl
          ? `Repository: ${result.project.repositoryUrl}`
          : null,
        `Import: ${result.import.id}`,
        `Branch: ${result.import.branch ?? params.default_branch ?? "default"}`,
        `Import status: ${result.import.status}`,
        `Parse status: ${result.import.parseStatus}`,
        "Next action: call reimport until indexing is ready.",
      ]
        .filter(Boolean)
        .join("\n");

      return success(summary, {
        project: result.project,
        import: result.import,
        source: result.source,
        workspaceProjectIdSaved: true,
        nextAction: "reimport",
      });
    }),
  );
}
