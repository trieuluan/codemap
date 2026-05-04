import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";

import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type { ProjectInsightsSummary } from "../lib/api-types.js";

export function registerFindCyclesTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "find_cycles",
    {
      title: "Find Circular Dependencies",
      description:
        "Find circular dependencies (cycles) in the project's codebase. " +
        "Cycles can cause issues like infinite loops, increased coupling, and build problems. " +
        "Returns detailed information about each cycle including the files involved. " +
        "project_id is optional if workspace is linked.",
      inputSchema: {
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
        max_files: z
          .number()
          .optional()
          .default(50)
          .describe("Maximum number of files to analyze for cycles. Default: 50."),
      },
    },
    withToolError(async ({ project_id, max_files }) => {
      const client = createCodeMapClient(config);
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        return success(
          "No project ID provided and no linked project found for this workspace.\n" +
            "Run create_project first to link this workspace to a CodeMap project.",
          {
            projectId: null,
            cycles: [],
          },
        );
      }

      // Get project insights which includes circular dependency candidates
      const insights = await client.request<ProjectInsightsSummary>(
        `/projects/${encodeURIComponent(resolvedProjectId)}/map/insights`,
        {
          authRequired: true,
          query: { sections: "cycles" },
        },
      );

      const cycles = insights.circularDependencyCandidates || [];
      const totalCycles = cycles.length;

      if (totalCycles === 0) {
        const summary = `✅ No circular dependencies found in the codebase.`;

        return success(summary, {
          projectId: resolvedProjectId,
          cycles: [],
          total: 0,
          filesAnalyzed: insights.totals?.files || 0,
        });
      }

      const summary = buildSummary(cycles, totalCycles, max_files);

      return success(summary, {
        projectId: resolvedProjectId,
        cycles: cycles.slice(0, max_files),
        total: totalCycles,
        filesAnalyzed: insights.totals?.files || 0,
      });
    }),
  );
}

function buildSummary(
  cycles: Array<{
    paths: string[];
    edgeCount: number;
    kind: string;
    summary: string;
  }>,
  total: number,
  maxFiles: number,
): string {
  const lines: string[] = [];

  lines.push(`## Circular Dependencies Found`);
  lines.push("");
  lines.push(`**Total cycles: ${total}**`);
  lines.push("");

  if (cycles.length === 0) {
    lines.push("No circular dependencies detected.");
  } else {
    lines.push("### Cycles Detected");
    lines.push("");

    for (let i = 0; i < Math.min(cycles.length, maxFiles); i++) {
      const cycle = cycles[i];
      const cycleFiles = cycle.paths || [];

      lines.push(`#### Cycle ${i + 1}`);
      lines.push("");

      if (cycleFiles.length > 0) {
        lines.push("Files in cycle:");
        lines.push("");
        for (let j = 0; j < cycleFiles.length; j++) {
          lines.push(`${j + 1}. \`${cycleFiles[j]}\``);
        }
        lines.push("");
      }

      if (cycle.summary) {
        lines.push(`Summary: ${cycle.summary}`);
        lines.push(`Kind: ${cycle.kind} | Edges: ${cycle.edgeCount}`);
        lines.push("");
      }
    }

    if (cycles.length > maxFiles) {
      lines.push(`... and ${cycles.length - maxFiles} more cycles (showing first ${maxFiles})`);
      lines.push("");
    }

    lines.push("### Impact");
    lines.push("");
    lines.push("Circular dependencies can cause:");
    lines.push("- Build failures or inconsistencies");
    lines.push("- Infinite loops during module initialization");
    lines.push("- Increased coupling between modules");
    lines.push("- Difficulty in testing isolated components");
    lines.push("");
    lines.push("### Recommendation");
    lines.push("");
    lines.push("To break cycles:");
    lines.push("1. Extract shared code into a separate module");
    lines.push("2. Use dependency injection");
    lines.push("3. Apply interface segregation");
    lines.push("4. Consider inverting dependencies");
  }

  return lines.join("\n");
}
