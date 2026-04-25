import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type { ProjectDetail } from "../lib/api-types.js";

function formatProject(p: ProjectDetail): string {
  const lines: string[] = [
    `Name: ${p.name}`,
    `ID: ${p.id}`,
    `Slug: ${p.slug}`,
    `Status: ${p.status}`,
    `Provider: ${p.provider ?? "none"}`,
    `Visibility: ${p.visibility}`,
  ];

  if (p.description) lines.push(`Description: ${p.description}`);
  if (p.defaultBranch) lines.push(`Default branch: ${p.defaultBranch}`);
  if (p.repositoryUrl) lines.push(`Repository: ${p.repositoryUrl}`);
  if (p.localWorkspacePath) lines.push(`Workspace path: ${p.localWorkspacePath}`);
  if (p.lastImportedAt) {
    lines.push(`Last imported: ${new Date(p.lastImportedAt).toLocaleString()}`);
  }

  lines.push(`Created: ${new Date(p.createdAt).toLocaleString()}`);

  return lines.join("\n");
}

export function registerGetProjectTool(server: McpServer, config: McpServerConfig) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "get_project",
    {
      title: "Get Project",
      description:
        "Returns details for a CodeMap project: name, status, provider, repository URL, " +
        "default branch, and last import time. " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(async ({ project_id }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());
      const linkedWorkspace = !project_id;

      if (!resolvedProjectId) {
        const summary =
          "No project ID provided and no linked project found for this workspace.\n" +
          "Run create_project first to link this workspace to a CodeMap project.";

        return success(summary, {
          linkedWorkspace,
          projectId: null,
          found: false,
          project: null,
        });
      }

      let project: ProjectDetail;

      try {
        project = await client.request<ProjectDetail>(
          `/projects/${encodeURIComponent(resolvedProjectId)}`,
          { authRequired: true },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("404")) {
          const summary =
            `Project not found: ${resolvedProjectId}\n` +
            "Check that the project ID is correct and you have access to it.";

          return success(summary, {
            linkedWorkspace,
            projectId: resolvedProjectId,
            found: false,
            project: null,
          });
        }

        throw error;
      }

      return success(formatProject(project), {
        linkedWorkspace,
        projectId: resolvedProjectId,
        found: true,
        project,
      });
    }),
  );
}
