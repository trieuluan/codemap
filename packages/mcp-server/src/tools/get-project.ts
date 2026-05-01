import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectConfig } from "../lib/workspace-project.js";
import type { ProjectDetail, WorkspaceDetail } from "../lib/api-types.js";
import {
  describeImportHealth,
  getProjectImportHealth,
} from "../lib/import-health.js";

function formatProject(
  p: ProjectDetail,
  health: Awaited<ReturnType<typeof getProjectImportHealth>>,
  accountWorkspace: WorkspaceDetail | null,
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
  if (accountWorkspace) {
    lines.push(
      `Workspace: ${accountWorkspace.workspace.name} (${accountWorkspace.workspace.type}, ${accountWorkspace.workspace.plan})`,
    );
  }
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
      inputSchema: {
        verbose: z
          .boolean()
          .optional()
          .default(false)
          .describe("Return full import and health objects. Use only when debugging a failed import."),
      },
    },
    withToolError(async ({ verbose }) => {
      const workspaceConfig = await readWorkspaceProjectConfig();
      const resolvedProjectId = workspaceConfig.projectId;

      if (!resolvedProjectId) {
        const summary =
          "No CodeMap project is linked to this workspace.\n" +
          "get_project only reads the current project saved in .codemap/mcp.json.\n" +
          `Workspace path: ${workspaceConfig.workspaceRootPath ?? process.cwd()}\n` +
          "Configure your MCP client to start this server with cwd set to the repo path.\n" +
          "Next action: call create_project to create or link a project for this workspace.";

        return success(summary, {
          linkedWorkspace: false,
          workspaceRootPath: workspaceConfig.workspaceRootPath,
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
            workspaceRootPath: workspaceConfig.workspaceRootPath,
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
      const accountWorkspace = project.workspaceId
        ? await client
            .request<WorkspaceDetail>(
              `/workspaces/${encodeURIComponent(project.workspaceId)}`,
              { authRequired: true },
            )
            .catch(() => null)
        : null;

      const healthSummary = verbose
        ? health
        : {
            state: health.state,
            isReady: health.isReady,
            isStale: health.isStale,
            needsReimport: health.needsReimport,
            nextAction: health.nextAction,
            commitComparison: health.commitComparison,
            workspaceResolution: health.workspaceResolution,
          };
      const latestImport = health.latestImport
        ? verbose
          ? health.latestImport
          : {
              id: health.latestImport.id,
              status: health.latestImport.status,
              parseStatus: health.latestImport.parseStatus,
              branch: health.latestImport.branch,
              commitSha: health.latestImport.commitSha,
              completedAt: health.latestImport.completedAt,
              indexedFileCount: health.latestImport.indexedFileCount,
              indexedSymbolCount: health.latestImport.indexedSymbolCount,
              indexedEdgeCount: health.latestImport.indexedEdgeCount,
              errorMessage: health.latestImport.errorMessage ?? null,
              parseError: health.latestImport.parseError ?? null,
            }
        : null;

      return success(formatProject(project, health, accountWorkspace), {
        linkedWorkspace: true,
        workspaceRootPath: workspaceConfig.workspaceRootPath,
        projectId: resolvedProjectId,
        found: true,
        project,
        health: healthSummary,
        workspace: accountWorkspace?.workspace ?? null,
        entitlements: accountWorkspace?.entitlements ?? null,
        usage: accountWorkspace?.usage ?? null,
        projectContext: {
          project,
          latestImport,
          health: healthSummary,
          workspace: accountWorkspace?.workspace ?? null,
          entitlements: accountWorkspace?.entitlements ?? null,
          usage: accountWorkspace?.usage ?? null,
          recommendedNextAction: health.nextAction,
          recommendedWorkflow: buildRecommendedWorkflow(health),
        },
      });
    }),
  );
}
