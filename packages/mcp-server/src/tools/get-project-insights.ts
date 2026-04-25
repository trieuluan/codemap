import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type { ProjectInsightsSummary } from "../lib/api-types.js";

export function registerGetProjectInsightsTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "get_project_insights",
    {
      title: "Get Project Insights",
      description:
        "Returns a comprehensive analysis of a CodeMap project: top files by " +
        "dependency count, orphan files (no dependents/imports), entry-like files " +
        "(likely app entry points), circular dependency candidates (cycles), folder " +
        "breakdown, and overall totals. Use this for architecture review, refactoring " +
        "planning, or understanding codebase health. " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "CodeMap project UUID. Auto-resolved from workspace if omitted.",
          ),
        sections: z
          .array(
            z.enum([
              "totals",
              "top_by_imports",
              "top_by_inbound",
              "cycles",
              "orphans",
              "entry_points",
              "folders",
            ]),
          )
          .optional()
          .describe(
            "Sections to include. Omit to return all sections. " +
              "Options: totals, top_by_imports, top_by_inbound, cycles, orphans, entry_points, folders.",
          ),
      },
    },
    withToolError(async ({ project_id, sections }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        const summary =
          "No project ID provided and no linked project found for this workspace.\n" +
          "Run create_project first to link this workspace to a CodeMap project.";

        return success(summary, {
          projectId: null,
          available: false,
          sections: sections ?? null,
          insights: null,
        });
      }

      let insights: ProjectInsightsSummary;

      try {
        insights = await client.request<ProjectInsightsSummary>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/map/insights`,
          { authRequired: true },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("404")) {
          const summary =
            `Project not found or not yet imported: ${resolvedProjectId}\n` +
            "Run trigger_reimport to index the project first.";

          return success(summary, {
            projectId: resolvedProjectId,
            available: false,
            sections: sections ?? null,
            insights: null,
          });
        }
        throw error;
      }

      const include = (section: string) =>
        !sections || sections.includes(section as never);

      const lines: string[] = ["# Project Insights", ""];

      // --- Totals ---
      if (include("totals")) {
        const t = insights.totals;
        lines.push("## Summary");
        lines.push(`Total files:      ${t.files}`);
        lines.push(`Source files:     ${t.sourceFiles}`);
        lines.push(`Parsed files:     ${t.parsedFiles}`);
        lines.push(`Dependencies:     ${t.dependencies}`);
        lines.push(`Symbols:          ${t.symbols}`);
        lines.push("");
      }

      // --- Cycles ---
      if (include("cycles")) {
        const cycles = insights.circularDependencyCandidates;
        lines.push(`## Circular Dependencies (${cycles.length})`);
        if (cycles.length === 0) {
          lines.push("No circular dependencies detected. ✅");
        } else {
          for (const cycle of cycles) {
            lines.push(`- [${cycle.kind}] ${cycle.summary}`);
            lines.push(`  Edges: ${cycle.edgeCount}`);
            lines.push(`  Files: ${cycle.paths.join(" → ")}`);
          }
        }
        lines.push("");
      }

      // --- Entry-like files ---
      if (include("entry_points")) {
        const entries = insights.entryLikeFiles;
        lines.push(`## Entry Points (${entries.length})`);
        if (entries.length === 0) {
          lines.push("No entry-like files detected.");
        } else {
          for (const f of entries) {
            const lang = f.language ? ` [${f.language}]` : "";
            lines.push(
              `- ${f.path}${lang}  score=${f.score}  in=${f.incomingCount} out=${f.outgoingCount}`,
            );
            lines.push(`  Reason: ${f.reason}`);
          }
        }
        lines.push("");
      }

      // --- Top files by outgoing imports ---
      if (include("top_by_imports")) {
        const top = insights.topFilesByImportCount;
        lines.push(`## Top Files by Import Count (${top.length})`);
        if (top.length === 0) {
          lines.push("No data available.");
        } else {
          for (const f of top) {
            const lang = f.language ? ` [${f.language}]` : "";
            lines.push(
              `- ${f.path}${lang}  imports=${f.outgoingCount}  imported-by=${f.incomingCount}`,
            );
          }
        }
        lines.push("");
      }

      // --- Top files by inbound dependency count ---
      if (include("top_by_inbound")) {
        const top = insights.topFilesByInboundDependencyCount;
        lines.push(`## Top Files by Inbound Dependencies (${top.length})`);
        if (top.length === 0) {
          lines.push("No data available.");
        } else {
          for (const f of top) {
            const lang = f.language ? ` [${f.language}]` : "";
            lines.push(
              `- ${f.path}${lang}  imported-by=${f.incomingCount}  imports=${f.outgoingCount}`,
            );
          }
        }
        lines.push("");
      }

      // --- Orphan files ---
      if (include("orphans")) {
        const orphans = insights.orphanFiles;
        lines.push(`## Orphan Files (${orphans.length})`);
        if (orphans.length === 0) {
          lines.push("No orphan files detected. ✅");
        } else {
          lines.push(
            "Files with no imports and no dependents (unreachable code):",
          );
          for (const f of orphans) {
            const lang = f.language ? ` [${f.language}]` : "";
            lines.push(`- ${f.path}${lang}`);
          }
        }
        lines.push("");
      }

      // --- Folder breakdown ---
      if (include("folders")) {
        const folders = insights.topFoldersBySourceFileCount;
        lines.push(`## Folder Breakdown (${folders.length})`);
        if (folders.length === 0) {
          lines.push("No folder data available.");
        } else {
          for (const f of folders) {
            lines.push(`- ${f.folder}/  (${f.sourceFileCount} source files)`);
          }
        }
        lines.push("");
      }

      return success(lines.join("\n"), {
        projectId: resolvedProjectId,
        available: true,
        sections: sections ?? null,
        insights,
      });
    }),
  );
}
