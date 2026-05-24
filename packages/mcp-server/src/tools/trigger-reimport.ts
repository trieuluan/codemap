import { z } from "zod";
import { uuidSchema } from "../lib/uuid-schema.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import { tryGetCurrentWorkspaceInfo } from "../lib/workspace-git.js";
import type { TriggerImportResult } from "../lib/api-types.js";

export function registerTriggerReimportTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "trigger_reimport",
    {
      title: "Trigger Re-import",
      description:
        "Triggers a new import for an existing CodeMap project. " +
        "Use this when there is no active import running — for example after a failed import, " +
        "or to re-scan the codebase after changes. " +
        "Returns an error if an import is already queued or running (use wait_for_import to check status first). " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        project_id: uuidSchema
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
        branch: z
          .string()
          .min(1)
          .max(255)
          .optional()
          .describe("Branch to import. Defaults to the project's default branch."),
      },
    },
    withToolError(async ({ project_id, branch }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        const summary =
          "No project ID provided and no linked project found for this workspace.\n" +
          "Use link_project to connect an existing project, or create_project to create one (first time only). These require a cloud project.";

        return success(summary, {
          triggered: false,
          projectId: null,
          import: null,
          reason: "missing_project_id",
          branch: branch ?? null,
          nextAction: "link_or_create_project",
        });
      }

      // Auto-detect current git branch when not explicitly provided.
      let resolvedBranch = branch ?? null;
      if (!resolvedBranch) {
        const ws = await tryGetCurrentWorkspaceInfo();
        resolvedBranch = ws?.branch ?? null;
      }

      let result: TriggerImportResult;

      try {
        result = await client.request<TriggerImportResult>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/import`,
          {
            authRequired: true,
            method: "POST",
            body: resolvedBranch ? { branch: resolvedBranch } : {},
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("409") || message.toLowerCase().includes("already")) {
          const summary =
            "An import is already queued or running for this project.\n" +
            "Use wait_for_import to check when it finishes before triggering another one.";

          return success(summary, {
            triggered: false,
            projectId: resolvedProjectId,
            import: null,
            reason: "import_already_running",
            branch: branch ?? null,
            nextAction: "wait_for_import",
          });
        }

        if (
          message.includes("WORKSPACE_CLOUD_IMPORT_NOT_AVAILABLE") ||
          message.includes("Cloud import is not available")
        ) {
          return success(
            "Cloud import is not available on the basic plan.\n" +
              "Upgrade to Developer or Team to enable cloud indexing and web graph/insights.\n" +
              "Local index tools (search_codebase, get_file, explore_task, find_related_files) are still available.",
            {
              triggered: false,
              projectId: resolvedProjectId,
              import: null,
              reason: "plan_not_supported",
              branch: branch ?? null,
              nextAction: "upgrade_plan",
            },
          );
        }

        if (message.includes("404")) {
          const summary =
            `Project not found: ${resolvedProjectId}\n` +
            "Check that the project ID is correct and you have access to it.";

          return success(summary, {
            triggered: false,
            projectId: resolvedProjectId,
            import: null,
            reason: "project_not_found",
            branch: branch ?? null,
            nextAction: "link_or_create_project",
          });
        }

        throw error;
      }

      const summary = [
        "Import triggered successfully.",
        `Import ID: ${result.id}`,
        `Status: ${result.status}`,
        result.branch ? `Branch: ${result.branch}` : null,
        "Next action: call wait_for_import to track progress.",
      ]
        .filter(Boolean)
        .join("\n");

      return success(summary, {
        triggered: true,
        projectId: resolvedProjectId,
        import: { id: result.id, status: result.status, branch: result.branch ?? null },
        reason: null,
        branch: result.branch ?? branch ?? null,
        nextAction: "wait_for_import",
      });
    }),
  );
}
