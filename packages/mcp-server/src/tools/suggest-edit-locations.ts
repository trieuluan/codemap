import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type {
  EditLocationConfidence,
  EditLocationSuggestion,
  EditLocationsResponse,
} from "../lib/api-types.js";

function formatSymbols(suggestion: EditLocationSuggestion) {
  if (suggestion.relevantSymbols.length === 0) {
    return "";
  }

  const symbols = suggestion.relevantSymbols
    .slice(0, 3)
    .map((symbol) => {
      const location = symbol.startLine ? `:${symbol.startLine}` : "";
      return `${symbol.name} [${symbol.kind}]${location}`;
    })
    .join(", ");

  return `\n   Symbols: ${symbols}`;
}

function buildSummary(task: string, response: EditLocationsResponse) {
  const lines = [`Suggested edit locations for: "${task}"`, ""];

  if (response.suggestions.length === 0) {
    lines.push("No edit locations found. Try search_codebase with more specific terms or reimport the project.");
    return lines.join("\n");
  }

  const groups: EditLocationConfidence[] = ["high", "medium", "low"];

  for (const confidence of groups) {
    const suggestions = response.suggestions.filter(
      (suggestion) => suggestion.confidence === confidence,
    );

    if (suggestions.length === 0) continue;

    lines.push(`## ${confidence.toUpperCase()} confidence (${suggestions.length})`);
    suggestions.forEach((suggestion, index) => {
      const lang = suggestion.language ? ` [${suggestion.language}]` : "";
      lines.push(
        `${index + 1}. ${suggestion.path}${lang}  score=${suggestion.score}`,
      );
      lines.push(`   Reason: ${suggestion.reason}`);
      lines.push(`   Signals: ${suggestion.signals.join(", ")}`);
      lines.push(`   Next: ${suggestion.suggestedNextTools.join(", ")}`);
      const symbols = formatSymbols(suggestion);
      if (symbols) lines.push(symbols);
    });
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function registerSuggestEditLocationsTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "suggest_edit_locations",
    {
      title: "Suggest Edit Locations",
      description:
        "Suggests likely files and symbols to inspect or edit for a natural-language task. " +
        "Use this before get_file when you do not know where to start. " +
        "This tool is deterministic and does not edit code or generate patches. " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        task: z
          .string()
          .min(1)
          .max(500)
          .describe("Natural-language implementation or investigation task."),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "CodeMap project UUID. Auto-resolved from workspace if omitted.",
          ),
        max_files: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe("Maximum number of file suggestions to return. Defaults to 10."),
      },
    },
    withToolError(async ({ task, project_id, max_files }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        const summary =
          "No project ID provided and no linked project found for this workspace.\n" +
          "Run create_project first to link this workspace to a CodeMap project.";

        return success(summary, {
          projectId: null,
          task,
          suggestions: [],
          available: false,
        });
      }

      let response: EditLocationsResponse;

      try {
        response = await client.request<EditLocationsResponse>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/map/edit-locations`,
          {
            authRequired: true,
            query: {
              q: task,
              limit: String(max_files ?? 10),
            },
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("404")) {
          const summary =
            `Project not found or not yet imported: ${resolvedProjectId}\n` +
            "Run trigger_reimport to index the project first.";

          return success(summary, {
            projectId: resolvedProjectId,
            task,
            suggestions: [],
            available: false,
          });
        }
        throw error;
      }

      return success(buildSummary(task, response), {
        ...response,
        task,
        available: true,
      });
    }),
  );
}
