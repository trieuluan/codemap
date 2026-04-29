import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type { ProjectDetail, ProjectImportDetail } from "../lib/api-types.js";
import {
  buildImportHealth,
  describeImportHealth,
  isImportDone,
} from "../lib/import-health.js";
import { resolveWorkspace } from "../lib/workspace-resolver.js";

const POLL_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 45_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isDone(status: ProjectImportDetail["status"]) {
  return isImportDone(status);
}

function formatResult(
  imp: ProjectImportDetail,
  timedOut: boolean,
  health: ReturnType<typeof buildImportHealth>,
): string {
  if (timedOut) {
    return [
      `Import is still in progress (status: ${imp.status}, parse: ${imp.parseStatus}).`,
      imp.parseStatus === "queued"
        ? "Parse job is queued and waiting for a worker."
        : null,
      "Call wait_for_import again to continue waiting.",
      "",
      describeImportHealth(health),
    ].filter(Boolean).join("\n");
  }

  if (imp.status === "completed") {
    return [
      "Import completed successfully.",
      `Parse status: ${imp.parseStatus}`,
      imp.parseStatus === "queued"
        ? "Parse job is queued and waiting for a worker."
        : null,
      imp.branch ? `Branch: ${imp.branch}` : null,
      imp.commitSha ? `Commit: ${imp.commitSha.slice(0, 8)}` : null,
      imp.completedAt
        ? `Completed at: ${new Date(imp.completedAt).toLocaleString()}`
        : null,
      imp.parseStatus === "partial"
        ? "Note: some files could not be fully parsed."
        : null,
      "",
      describeImportHealth(health),
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "Import failed.",
    imp.errorMessage ? `Error: ${imp.errorMessage}` : null,
    imp.parseError ? `Parse error: ${imp.parseError}` : null,
    "",
    describeImportHealth(health),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildResultData(
  projectId: string,
  imp: ProjectImportDetail | null,
  timedOut: boolean,
  health: ReturnType<typeof buildImportHealth>,
) {
  return {
    projectId,
    import: imp,
    status: imp?.status ?? "missing",
    parseStatus: imp?.parseStatus ?? null,
    timedOut,
    completed: imp ? isDone(imp.status) : false,
    commit: imp?.commitSha ?? null,
    completedAt: imp?.completedAt ?? null,
    health,
    nextAction: health.nextAction,
  };
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
        "Always uses the most recent import — no need to track import IDs. " +
        "IMPORTANT: timedOut=true is a normal checkpoint, NOT a failure — the import is still running. " +
        "When timedOut=true, call wait_for_import again immediately to keep polling. " +
        "Only stop when completed=true or data.status === 'failed'. " +
        "project_id is optional if this workspace was linked via create_project.",
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
        const summary =
          "No project ID provided and no linked project found for this workspace.\n" +
          "Run create_project first to link this workspace to a CodeMap project.";

        return success(summary, {
          projectId: null,
          import: null,
          status: "missing",
          parseStatus: null,
          timedOut: false,
          completed: false,
          commit: null,
          completedAt: null,
          nextAction: "create_project",
        });
      }

      const maxWaitMs = timeout_ms ?? DEFAULT_TIMEOUT_MS;
      const startedAt = Date.now();
      const project = await client.request<ProjectDetail>(
        `/projects/${encodeURIComponent(resolvedProjectId)}`,
        { authRequired: true },
      );

      while (true) {
        const imports = await client.request<ProjectImportDetail[]>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/imports`,
          { authRequired: true },
        );

        const latest = imports[0];

        if (!latest) {
          const resolvedWorkspace = await resolveWorkspace({ project });
          const health = buildImportHealth({
            latestImport: null,
            workspace: resolvedWorkspace.workspace,
            workspaceResolution: resolvedWorkspace.resolution,
            project,
          });
          return success(
            ["No imports found for this project.", describeImportHealth(health)]
              .filter(Boolean)
              .join("\n\n"),
            buildResultData(resolvedProjectId, null, false, health),
          );
        }

        if (isDone(latest.status)) {
          const resolvedWorkspace = await resolveWorkspace({ project });
          const health = buildImportHealth({
            latestImport: latest,
            workspace: resolvedWorkspace.workspace,
            workspaceResolution: resolvedWorkspace.resolution,
            project,
          });
          return success(
            formatResult(latest, false, health),
            buildResultData(resolvedProjectId, latest, false, health),
          );
        }

        const elapsed = Date.now() - startedAt;
        if (elapsed + POLL_INTERVAL_MS >= maxWaitMs) {
          const resolvedWorkspace = await resolveWorkspace({ project });
          const health = buildImportHealth({
            latestImport: latest,
            workspace: resolvedWorkspace.workspace,
            workspaceResolution: resolvedWorkspace.resolution,
            project,
          });
          return success(
            formatResult(latest, true, health),
            buildResultData(resolvedProjectId, latest, true, health),
          );
        }

        await sleep(POLL_INTERVAL_MS);
      }
    }),
  );
}
