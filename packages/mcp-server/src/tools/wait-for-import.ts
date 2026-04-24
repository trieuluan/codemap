import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { text, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type { ProjectImportDetail } from "../lib/api-types.js";

const POLL_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 45_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isDone(status: ProjectImportDetail["status"]) {
  return status === "completed" || status === "failed";
}

function formatResult(imp: ProjectImportDetail, timedOut: boolean): string {
  if (timedOut) {
    return [
      `Import is still in progress (status: ${imp.status}, parse: ${imp.parseStatus}).`,
      "Call wait_for_import again to continue waiting.",
    ].join("\n");
  }

  if (imp.status === "completed") {
    return [
      "Import completed successfully.",
      `Parse status: ${imp.parseStatus}`,
      imp.branch ? `Branch: ${imp.branch}` : null,
      imp.commitSha ? `Commit: ${imp.commitSha.slice(0, 8)}` : null,
      imp.completedAt
        ? `Completed at: ${new Date(imp.completedAt).toLocaleString()}`
        : null,
      imp.parseStatus === "partial"
        ? "Note: some files could not be fully parsed."
        : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "Import failed.",
    imp.errorMessage ? `Error: ${imp.errorMessage}` : null,
    imp.parseError ? `Parse error: ${imp.parseError}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function registerWaitForImportTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "wait_for_import",
    {
      title: "Wait For Import",
      description:
        "Polls the latest CodeMap import for a project until it completes or times out. " +
        "Call this immediately after create_project to know when the codebase is ready to query. " +
        "project_id is optional if this workspace was linked via create_project. " +
        "Always uses the most recent import — no need to track import IDs. " +
        "If timedOut is reported, call again — the import is still running.",
      inputSchema: {
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
        timeout_ms: z
          .number()
          .int()
          .min(5_000)
          .max(120_000)
          .optional()
          .describe(`Max milliseconds to wait per call. Defaults to ${DEFAULT_TIMEOUT_MS}.`),
      },
    },
    withToolError(async ({ project_id, timeout_ms }) => {
      const resolvedProjectId = project_id ?? await readWorkspaceProjectId();

      if (!resolvedProjectId) {
        return text(
          "No project ID provided and no linked project found for this workspace.\n" +
          "Run create_project first to link this workspace to a CodeMap project.",
        );
      }

      const maxWaitMs = timeout_ms ?? DEFAULT_TIMEOUT_MS;
      const startedAt = Date.now();

      while (true) {
        const imports = await client.request<ProjectImportDetail[]>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/imports`,
          { authRequired: true },
        );

        const latest = imports[0];

        if (!latest) {
          return text("No imports found for this project.");
        }

        if (isDone(latest.status)) {
          return text(formatResult(latest, false));
        }

        const elapsed = Date.now() - startedAt;
        if (elapsed + POLL_INTERVAL_MS >= maxWaitMs) {
          return text(formatResult(latest, true));
        }

        await sleep(POLL_INTERVAL_MS);
      }
    }),
  );
}
