import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { text, withToolError } from "../lib/tool-response.js";
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
        return text(
          "No project ID provided and no linked project found for this workspace.\n" +
            "Run create_project first to link this workspace to a CodeMap project.",
        );
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
          return text(
            "An import is already queued or running for this project.\n" +
              "Use wait_for_import to check when it finishes before triggering another one.",
          );
        }

        if (message.includes("404")) {
          return text(
            `Project not found: ${resolvedProjectId}\n` +
              "Check that the project ID is correct and you have access to it.",
          );
        }

        throw error;
      }

      return text(
        [
          "Import triggered successfully.",
          `Import ID: ${result.id}`,
          `Status: ${result.status}`,
          result.branch ? `Branch: ${result.branch}` : null,
          "Call wait_for_import to track progress.",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }),
  );
}
