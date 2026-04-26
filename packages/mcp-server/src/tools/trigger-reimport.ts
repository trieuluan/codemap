import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
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
        project_id: z
          .string()
          .uuid()
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
          "Run create_project first to link this workspace to a CodeMap project.";

        return success(summary, {
          triggered: false,
          projectId: null,
          import: null,
          reason: "missing_project_id",
          branch: branch ?? null,
          nextAction: "create_project",
        });
      }

      let result: TriggerImportResult;

      try {
        result = await client.request<TriggerImportResult>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/import`,
          {
            authRequired: true,
            method: "POST",
            body: branch ? { branch } : {},
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
            nextAction: "create_project",
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
        import: result,
        reason: null,
        branch: result.branch ?? branch ?? null,
        nextAction: "wait_for_import",
      });
    }),
  );
}
