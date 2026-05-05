import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type {
  CodebaseSearchResponse,
  EditLocationsResponse,
  EditLocationSuggestion,
} from "../lib/api-types.js";

function formatReadHint(s: EditLocationSuggestion): string {
  const plan = s.readPlan;
  const parts: string[] = [`include=${JSON.stringify(plan.include)}`];
  if (plan.symbolNames && plan.symbolNames.length > 0) {
    parts.push(`symbol_names=${JSON.stringify(plan.symbolNames)}`);
  }
  return `get_file("${s.path}", ${parts.join(", ")})`;
}

function buildOutput(
  task: string,
  search: CodebaseSearchResponse,
  editLocs: EditLocationsResponse,
): string {
  const lines: string[] = [`## explore_task: "${task}"`, ""];

  const totalSearch =
    search.files.length + search.symbols.length + search.exports.length;

  if (totalSearch > 0) {
    lines.push(`### Keyword matches (${totalSearch})`);
    search.symbols.slice(0, 5).forEach((sym, i) => {
      lines.push(
        `${i + 1}. ${sym.displayName} [${sym.symbolKind}] — ${sym.filePath}:${sym.startLine ?? ""}`,
      );
    });
    search.files.slice(0, 3).forEach((f) => {
      lines.push(`  file: ${f.path}`);
    });
    lines.push("");
  }

  const highMed = editLocs.suggestions.filter(
    (s) => s.confidence === "high" || s.confidence === "medium",
  );

  if (highMed.length > 0) {
    lines.push(`### Files to edit (top ${Math.min(highMed.length, 6)})`);
    highMed.slice(0, 6).forEach((s, i) => {
      const lang = s.language ? ` [${s.language}]` : "";
      lines.push(`${i + 1}. ${s.path}${lang}  [${s.confidence}]`);
      lines.push(`   Reason: ${s.reason}`);
      lines.push(`   Read: ${formatReadHint(s)}`);
    });
    lines.push("");
  }

  lines.push("### Next step");
  if (highMed.length > 0) {
    lines.push(`Call: ${formatReadHint(highMed[0])}`);
  } else if (search.symbols.length > 0) {
    const sym = search.symbols[0];
    lines.push(`Call: get_file("${sym.filePath}", include=["outline"])`);
  } else if (search.files.length > 0) {
    lines.push(`Call: get_file("${search.files[0].path}", include=["outline"])`);
  } else {
    lines.push(
      "No results found. Call get_project_map() to browse structure, or trigger_reimport() if index may be stale.",
    );
  }

  return lines.join("\n");
}

export function registerExploreTaskTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "explore_task",
    {
      title: "Explore Task",
      description:
        "Starting point for any coding task. Finds relevant files and suggests edit locations in one call. " +
        "Runs keyword search + edit-location analysis in parallel and returns a ranked list of files to read next. " +
        "Use this first — replaces calling search_codebase + suggest_edit_locations separately.",
      inputSchema: {
        task: z
          .string()
          .min(1)
          .max(500)
          .describe("Describe the task, feature, or bug to investigate."),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(async ({ task, project_id }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        return success(
          "No linked project found. Run link_project or get_project first.",
          { projectId: null, task, available: false },
        );
      }

      const [searchResult, editLocsResult] = await Promise.allSettled([
        client.request<CodebaseSearchResponse>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
          { authRequired: true, query: { q: task } },
        ),
        client.request<EditLocationsResponse>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/map/edit-locations`,
          { authRequired: true, query: { q: task, limit: "8" } },
        ),
      ]);

      const search: CodebaseSearchResponse =
        searchResult.status === "fulfilled"
          ? searchResult.value
          : { files: [], symbols: [], exports: [] };

      const editLocs: EditLocationsResponse =
        editLocsResult.status === "fulfilled"
          ? editLocsResult.value
          : ({ suggestions: [] } as unknown as EditLocationsResponse);

      return success(buildOutput(task, search, editLocs), {
        projectId: resolvedProjectId,
        task,
        available: true,
        searchResults: {
          files: search.files,
          symbols: search.symbols,
          exports: search.exports,
        },
        editSuggestions: editLocs.suggestions,
      });
    }),
  );
}
