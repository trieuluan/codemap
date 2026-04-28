import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type { ProjectDetail } from "../lib/api-types.js";
import {
  describeImportHealth,
  getProjectImportHealth,
} from "../lib/import-health.js";

function formatProject(
  p: ProjectDetail,
  health: Awaited<ReturnType<typeof getProjectImportHealth>>,
): string {
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
  if (p.localWorkspacePath)
    lines.push(`Workspace path: ${p.localWorkspacePath}`);
  if (p.lastImportedAt) {
    lines.push(`Last imported: ${new Date(p.lastImportedAt).toLocaleString()}`);
  }

  lines.push(`Created: ${new Date(p.createdAt).toLocaleString()}`);
  lines.push("");
  lines.push(describeImportHealth(health));

  return lines.join("\n");
}

function buildRecommendedWorkflow(
  health: Awaited<ReturnType<typeof getProjectImportHealth>>,
) {
  if (health.nextAction === "trigger_reimport") {
    return [
      "Call trigger_reimport to refresh the CodeMap index.",
      "Call wait_for_import until parseStatus is completed.",
      "Use suggest_edit_locations or search_codebase before reading files.",
    ];
  }

  if (health.nextAction === "wait_for_import") {
    return [
      "Call wait_for_import until import and parse complete.",
      "Use get_project again to confirm health is ready.",
    ];
  }

  if (health.nextAction === "inspect_import_error") {
    return [
      "Inspect latestImport.errorMessage and latestImport.parseError.",
      "Fix the import source or parser issue, then call trigger_reimport.",
    ];
  }

  return [
    "Use suggest_edit_locations for broad implementation tasks.",
    "Use search_codebase for known files, symbols, or exports.",
    "Use get_file with outline before reading large files.",
  ];
}

export function registerGetProjectTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);
  server.registerTool(
    "get_project",
    {
      title: "Get Project",
      description:
        "Returns the current linked CodeMap project for this workspace. " +
        "The project link is read from .codemap/mcp.json after create_project saves it. " +
        "Call this with no arguments. If no project is linked, call create_project.",
      inputSchema: {},
    },
    withToolError(async () => {
      const resolvedProjectId = await readWorkspaceProjectId();

      if (!resolvedProjectId) {
        const summary =
          "No CodeMap project is linked to this workspace.\n" +
          "get_project only reads the current project saved in .codemap/mcp.json.\n" +
          "Next action: call create_project to create or link a project for this workspace.";

        return success(summary, {
          linkedWorkspace: false,
          projectId: null,
          found: false,
          project: null,
          nextAction: "create_project",
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
            linkedWorkspace: true,
            projectId: resolvedProjectId,
            found: false,
            project: null,
            nextAction: "create_project",
          });
        }

        throw error;
      }

      const health = await getProjectImportHealth(
        client,
        resolvedProjectId,
        project,
      );

      return success(formatProject(project, health), {
        linkedWorkspace: true,
        projectId: resolvedProjectId,
        found: true,
        project,
        health,
        projectContext: {
          project,
          latestImport: health.latestImport,
          health,
          workspace: health.workspace,
          recommendedNextAction: health.nextAction,
          recommendedWorkflow: buildRecommendedWorkflow(health),
        },
      });
    }),
  );
}
