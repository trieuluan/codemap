import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";

type DiffFileStatus = "added" | "modified" | "deleted" | "renamed" | "copied";

interface DiffFile {
  path: string;
  status: DiffFileStatus;
  oldPath?: string;
  patch?: string;
}

interface ProjectDiffResponse {
  from: string;
  to: string;
  files: DiffFile[];
}

const STATUS_ICON: Record<DiffFileStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
};

function buildOutput(result: ProjectDiffResponse, includePatch: boolean): string {
  const lines: string[] = [
    `Diff: ${result.from.slice(0, 8)}..${result.to.slice(0, 8)}`,
    `Files changed: ${result.files.length}\n`,
  ];

  for (const file of result.files) {
    const icon = STATUS_ICON[file.status] ?? "M";
    const rename = file.oldPath ? ` (from ${file.oldPath})` : "";
    lines.push(`${icon} ${file.path}${rename}`);
  }

  if (includePatch) {
    for (const file of result.files) {
      if (file.patch) {
        lines.push(`\n--- ${file.path} ---`);
        lines.push(file.patch);
      }
    }
  }

  return lines.join("\n");
}

export function registerGetDiffTool(server: McpServer, config: McpServerConfig) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "get_diff",
    {
      title: "Get Git Diff",
      description:
        "Returns the list of files changed between two commits in a CodeMap project. " +
        "Use this to understand what changed between two points in history — useful for reviewing changes, " +
        "debugging regressions, or understanding the scope of a PR. " +
        "Requires the project to have a retained workspace (sourceAvailable). " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        from: z
          .string()
          .min(1)
          .describe("Base commit SHA or ref (e.g. branch name, tag, HEAD~1)."),
        to: z
          .string()
          .min(1)
          .optional()
          .describe("Target commit SHA or ref. Defaults to HEAD."),
        include_patch: z
          .boolean()
          .optional()
          .describe("Include full patch/diff content for each file. Defaults to false."),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(async ({ from, to, include_patch, project_id }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());
      const includePatch = Boolean(include_patch);

      if (!resolvedProjectId) {
        const summary =
          "No project ID provided and no linked project found for this workspace.\n" +
          "Run create_project first to link this workspace to a CodeMap project.";

        return success(summary, {
          projectId: null,
          available: false,
          from,
          to: to ?? "HEAD",
          includePatch,
          totalChanged: 0,
          files: [],
        });
      }

      const query: Record<string, string> = { from };
      if (to) query.to = to;
      if (includePatch) query.includePatch = "true";

      let result: ProjectDiffResponse;

      try {
        result = await client.request<ProjectDiffResponse>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/map/diff`,
          { authRequired: true, query },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("404")) {
          return success(`Project not found: ${resolvedProjectId}`, {
            projectId: resolvedProjectId,
            available: false,
            from,
            to: to ?? "HEAD",
            includePatch,
            totalChanged: 0,
            files: [],
          });
        }
        if (message.includes("422")) {
          const summary =
            "Retained workspace is not available for this project. " +
            "Re-import the project to restore git access.";

          return success(summary, {
            projectId: resolvedProjectId,
            available: false,
            from,
            to: to ?? "HEAD",
            includePatch,
            totalChanged: 0,
            files: [],
          });
        }

        throw error;
      }

      return success(buildOutput(result, includePatch), {
        projectId: resolvedProjectId,
        available: true,
        from: result.from,
        to: result.to,
        includePatch,
        totalChanged: result.files.length,
        files: result.files,
      });
    }),
  );
}
