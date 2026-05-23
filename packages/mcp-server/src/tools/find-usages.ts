import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type {
  CodebaseSearchResponse,
  SearchSymbolResult,
  SymbolUsagesResponse,
} from "../lib/api-types.js";

function formatRange(range: { startLine: number; startCol: number } | null) {
  return range ? `${range.startLine}:${range.startCol}` : "?:?";
}

function formatUsageLine(
  usage: {
    filePath: string;
    range: { startLine: number; startCol: number } | null;
    confidence: string;
    role?: string;
    evidence?: string;
    snippetPreview?: string | null;
  },
) {
  const label = usage.role ?? usage.evidence ?? "usage";
  const snippet = usage.snippetPreview ? ` - ${usage.snippetPreview}` : "";
  return `  ${usage.filePath}:${formatRange(usage.range)} [${usage.confidence}/${label}]${snippet}`;
}

export function registerFindUsagesTool(server: McpServer, config: McpServerConfig) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "find_usages",
    {
      title: "Find Usages",
      description:
        "Find all references to a symbol by name: definitions, in-file occurrences, callers. " +
        "Use when you only know the name, not which file. " +
        "Use find_callers instead when you know the exact file — faster and more precise. " +
        "Capped at 25 per category. project_id is optional if workspace is linked.",
      inputSchema: {
        symbol_name: z
          .string()
          .min(1)
          .describe("Name of the symbol to find usages for."),
        project_id: z
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(async ({ symbol_name, project_id }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        return success("No project ID provided and no linked project found.", {
          projectId: null,
          symbolName: symbol_name,
          found: false,
          definitions: [],
          usages: [],
          callers: [],
        });
      }

      const searchResult = await client.request<CodebaseSearchResponse>(
        `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
        { authRequired: true, query: { q: symbol_name } },
      );

      const exactSymbols = searchResult.symbols.filter(
        (symbol): symbol is SearchSymbolResult =>
          symbol.displayName === symbol_name && Boolean(symbol.id),
      );

      if (exactSymbols.length === 0) {
        return success(`Symbol '${symbol_name}' not found in codebase.`, {
          projectId: resolvedProjectId,
          symbolName: symbol_name,
          found: false,
          definitions: [],
          usages: [],
          callers: [],
        });
      }

      const usageResults = await Promise.all(
        exactSymbols.map((symbol) =>
          client.request<SymbolUsagesResponse>(
            `/projects/${encodeURIComponent(
              resolvedProjectId,
            )}/map/symbols/${encodeURIComponent(symbol.id)}/usages`,
            { authRequired: true },
          ),
        ),
      );

      const lines: string[] = [
        `Usages of '${symbol_name}'`,
        `Matched symbols: ${usageResults.length}`,
        "",
      ];

      for (const result of usageResults) {
        const target = result.target;
        lines.push(
          `## ${target.displayName} (${target.symbolKind}) in ${target.filePath ?? "(unknown file)"}:${formatRange(target.range)}`,
        );
        if (target.signature) lines.push(`  ${target.signature}`);
        lines.push(
          `  Confidence data: ${result.meta.source}, ${result.meta.staleness}, parse=${result.meta.parseStatus ?? "unknown"}`,
        );

        lines.push("", `  Definitions (${result.totals.definitions})`);
        if (result.definitions.length === 0) {
          lines.push("  (none)");
        } else {
          for (const definition of result.definitions.slice(0, 10)) {
            lines.push(formatUsageLine(definition));
          }
        }

        lines.push("", `  Occurrence usages (${result.totals.usages})`);
        if (result.usages.length === 0) {
          lines.push("  (none)");
        } else {
          for (const usage of result.usages.slice(0, 25)) {
            lines.push(formatUsageLine(usage));
          }
        }

        lines.push("", `  Callers (${result.totals.callers})`);
        if (result.callers.length === 0) {
          lines.push("  No callers found.");
        } else {
          for (const caller of result.callers.slice(0, 25)) {
            lines.push(formatUsageLine(caller));
          }
        }
        lines.push("");
      }

      const totalUsages = usageResults.reduce((sum, item) => sum + item.totals.usages, 0);
      const totalCallers = usageResults.reduce((sum, item) => sum + item.totals.callers, 0);

      const defFile = usageResults[0]?.target.filePath;
      const topCaller = usageResults[0]?.callers[0]?.filePath;
      const suggestedNextTools: string[] = [];
      if (defFile) {
        suggestedNextTools.push(
          `get_file("${defFile}", include=["symbols"], symbol_names=["${symbol_name}"])`,
        );
      }
      if (topCaller && topCaller !== defFile) {
        suggestedNextTools.push(`get_file("${topCaller}", include=["outline"])`);
      }
      if (totalCallers > 10) {
        suggestedNextTools.push(
          `find_related_files(symbol_name="${symbol_name}")  // ${totalCallers} callers — check impact`,
        );
      }
      suggestedNextTools.push("get_working_diff()  // after making changes");

      return success(lines.join("\n").trim(), {
        projectId: resolvedProjectId,
        symbolName: symbol_name,
        found: true,
        results: usageResults,
        totalDefinitions: usageResults.reduce((sum, item) => sum + item.totals.definitions, 0),
        totalUsages,
        totalCallers,
        truncated: usageResults.some((r) => r.usages.length >= 25 || r.callers.length >= 25),
        suggestedNextTools,
      });
    }),
  );
}
