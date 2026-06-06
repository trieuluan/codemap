import { z } from "zod";
import { uuidSchema } from "@codemap-ai/core/lib/uuid-schema.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "@codemap-ai/core/config.js";
import { createCodeMapClient } from "@codemap-ai/core/lib/codemap-api.js";
import { success, withToolError } from "@codemap-ai/core/lib/tool-response.js";
import { readWorkspaceProjectId } from "@codemap-ai/core/lib/workspace-project.js";
import { tryGetCurrentWorkspaceInfo } from "@codemap-ai/core/lib/workspace-git.js";
import type {
  ProjectDetail,
  ProjectImportDetail,
  TriggerImportResult,
} from "@codemap-ai/core/lib/api-types.js";
import {
  buildImportHealth,
  describeImportHealth,
  isImportDone,
} from "@codemap-ai/core/lib/import-health.js";
import { resolveWorkspace } from "@codemap-ai/core/lib/workspace-resolver.js";

const POLL_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 45_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function formatWaitResult(
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
      "Call reimport(action=\"wait\") again to continue waiting.",
      "",
      describeImportHealth(health),
    ]
      .filter(Boolean)
      .join("\n");
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

function buildWaitResultData(
  projectId: string,
  imp: ProjectImportDetail | null,
  timedOut: boolean,
  health: ReturnType<typeof buildImportHealth>,
  verbose: boolean,
) {
  const importData = imp
    ? verbose
      ? imp
      : {
          id: imp.id,
          status: imp.status,
          parseStatus: imp.parseStatus,
          branch: imp.branch,
          commitSha: imp.commitSha,
          completedAt: imp.completedAt,
          indexedFileCount: imp.indexedFileCount,
          indexedSymbolCount: imp.indexedSymbolCount,
          indexedEdgeCount: imp.indexedEdgeCount,
          errorMessage: imp.errorMessage ?? null,
          parseError: imp.parseError ?? null,
        }
    : null;

  const healthData = verbose
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

  return {
    projectId,
    import: importData,
    status: imp?.status ?? "missing",
    parseStatus: imp?.parseStatus ?? null,
    timedOut,
    completed: imp ? isImportDone(imp.status) : false,
    commit: imp?.commitSha ?? null,
    completedAt: imp?.completedAt ?? null,
    health: healthData,
    nextAction: health.nextAction,
  };
}

export function registerReimportTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "reimport",
    {
      title: "Reimport",
      description:
        "Trigger and/or wait for a CodeMap cloud import. " +
        "action=\"trigger\" (default) queues a new import and returns immediately. " +
        "action=\"wait\" polls the latest existing import until completion or timeout — use after a previous trigger or when checking ongoing import status. " +
        "action=\"trigger_and_wait\" queues a new import then polls until it completes (or falls back to polling the existing import if one is already running). " +
        "Only use for cloud-indexed projects when web graph/insights should refresh; for local-only work use refresh_local_index. " +
        "IMPORTANT: timedOut=true is a normal checkpoint, NOT a failure — the import is still running. " +
        "Only stop polling when completed=true or data.status === 'failed'. " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        action: z
          .enum(["trigger", "wait", "trigger_and_wait"])
          .optional()
          .default("trigger")
          .describe(
            "What to do. 'trigger' queues a new import. 'wait' polls the latest existing import. 'trigger_and_wait' does both.",
          ),
        project_id: uuidSchema
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
        branch: z
          .string()
          .min(1)
          .max(255)
          .optional()
          .describe("Branch to import. Only used for 'trigger' and 'trigger_and_wait'. Defaults to current branch."),
        timeout_ms: z
          .number()
          .int()
          .min(5_000)
          .max(120_000)
          .optional()
          .describe(
            `Max milliseconds to wait per call. Only used for 'wait' and 'trigger_and_wait'. Defaults to ${DEFAULT_TIMEOUT_MS}.`,
          ),
        verbose: z
          .boolean()
          .optional()
          .default(false)
          .describe("Return full import and health objects. Use only when debugging."),
      },
    },
    withToolError(async ({ action, project_id, branch, timeout_ms, verbose }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());
      const effectiveAction = action ?? "trigger";

      if (!resolvedProjectId) {
        const summary =
          "No project ID provided and no linked project found for this workspace.\n" +
          "Use link_project to connect an existing project, or create_project to create one (first time only). These require a cloud project.";

        return success(summary, {
          action: effectiveAction,
          triggered: false,
          projectId: null,
          import: null,
          reason: "missing_project_id",
          branch: branch ?? null,
          status: "missing",
          parseStatus: null,
          timedOut: false,
          completed: false,
          commit: null,
          completedAt: null,
          nextAction: "link_or_create_project",
        });
      }

      // ── TRIGGER phase (action = trigger or trigger_and_wait) ─────────────
      let triggered = false;
      let triggerReason: string | null = null;
      let triggerResult: TriggerImportResult | null = null;
      let resolvedBranch = branch ?? null;

      if (effectiveAction === "trigger" || effectiveAction === "trigger_and_wait") {
        if (!resolvedBranch) {
          const ws = await tryGetCurrentWorkspaceInfo();
          resolvedBranch = ws?.branch ?? null;
        }

        try {
          triggerResult = await client.request<TriggerImportResult>(
            `/projects/${encodeURIComponent(resolvedProjectId)}/import`,
            {
              authRequired: true,
              method: "POST",
              body: resolvedBranch ? { branch: resolvedBranch } : {},
            },
          );
          triggered = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          if (message.includes("409") || message.toLowerCase().includes("already")) {
            triggerReason = "import_already_running";
            // Fall through: for trigger_and_wait, still poll. For pure trigger, return.
            if (effectiveAction === "trigger") {
              const summary =
                "An import is already queued or running for this project.\n" +
                "Use reimport(action=\"wait\") to check when it finishes before triggering another one.";

              return success(summary, {
                action: effectiveAction,
                triggered: false,
                projectId: resolvedProjectId,
                import: null,
                reason: "import_already_running",
                branch: branch ?? null,
                status: "running",
                parseStatus: null,
                timedOut: false,
                completed: false,
                commit: null,
                completedAt: null,
                nextAction: "wait",
              });
            }
          } else if (
            message.includes("WORKSPACE_CLOUD_IMPORT_NOT_AVAILABLE") ||
            message.includes("Cloud import is not available")
          ) {
            return success(
              "Cloud import is not available on the basic plan.\n" +
                "Upgrade to Developer or Team to enable cloud indexing and web graph/insights.\n" +
                "Local index tools (search_codebase, get_file, explore_task, find_related_files) are still available.",
              {
                action: effectiveAction,
                triggered: false,
                projectId: resolvedProjectId,
                import: null,
                reason: "plan_not_supported",
                branch: branch ?? null,
                status: "unavailable",
                parseStatus: null,
                timedOut: false,
                completed: false,
                commit: null,
                completedAt: null,
                nextAction: "upgrade_plan",
              },
            );
          } else if (message.includes("404")) {
            return success(
              `Project not found: ${resolvedProjectId}\n` +
                "Check that the project ID is correct and you have access to it.",
              {
                action: effectiveAction,
                triggered: false,
                projectId: resolvedProjectId,
                import: null,
                reason: "project_not_found",
                branch: branch ?? null,
                status: "missing",
                parseStatus: null,
                timedOut: false,
                completed: false,
                commit: null,
                completedAt: null,
                nextAction: "link_or_create_project",
              },
            );
          } else {
            throw error;
          }
        }

        // Return-only for trigger action.
        if (effectiveAction === "trigger") {
          const summary = [
            "Import triggered successfully.",
            triggerResult ? `Import ID: ${triggerResult.id}` : null,
            triggerResult ? `Status: ${triggerResult.status}` : null,
            triggerResult?.branch ? `Branch: ${triggerResult.branch}` : null,
            "Next action: call reimport(action=\"wait\") to track progress.",
          ]
            .filter(Boolean)
            .join("\n");

          return success(summary, {
            action: effectiveAction,
            triggered,
            projectId: resolvedProjectId,
            import: triggerResult
              ? {
                  id: triggerResult.id,
                  status: triggerResult.status,
                  branch: triggerResult.branch ?? null,
                }
              : null,
            reason: triggerReason,
            branch: triggerResult?.branch ?? branch ?? null,
            status: triggerResult?.status ?? "queued",
            parseStatus: null,
            timedOut: false,
            completed: false,
            commit: null,
            completedAt: null,
            nextAction: "wait",
          });
        }
      }

      // ── WAIT phase (action = wait or trigger_and_wait) ───────────────────
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
            {
              action: effectiveAction,
              triggered,
              reason: triggerReason,
              branch: triggerResult?.branch ?? branch ?? null,
              ...buildWaitResultData(resolvedProjectId, null, false, health, verbose ?? false),
            },
          );
        }

        if (isImportDone(latest.status)) {
          const resolvedWorkspace = await resolveWorkspace({ project });
          const health = buildImportHealth({
            latestImport: latest,
            workspace: resolvedWorkspace.workspace,
            workspaceResolution: resolvedWorkspace.resolution,
            project,
          });
          return success(formatWaitResult(latest, false, health), {
            action: effectiveAction,
            triggered,
            reason: triggerReason,
            branch: latest.branch ?? branch ?? null,
            ...buildWaitResultData(resolvedProjectId, latest, false, health, verbose ?? false),
          });
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
          return success(formatWaitResult(latest, true, health), {
            action: effectiveAction,
            triggered,
            reason: triggerReason,
            branch: latest.branch ?? branch ?? null,
            ...buildWaitResultData(resolvedProjectId, latest, true, health, verbose ?? false),
          });
        }

        await sleep(POLL_INTERVAL_MS);
      }
    }),
  );
}
