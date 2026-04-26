import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type { SymbolUsagesResponse } from "../lib/api-types.js";

function formatRange(range: { startLine: number; startCol: number } | null) {
  return range ? `${range.startLine}:${range.startCol}` : "?:?";
}

export function registerFindCallersTool(server: McpServer, config: McpServerConfig) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "find_callers",
    {
      title: "Find Callers",
      description:
        "Find callers/usages of a symbol from a given file. " +
        "Returns occurrence-level ranges, import evidence, confidence, and parse staleness metadata. " +
        "Callers are static analysis results, not guaranteed runtime call graph edges. " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Repository-relative path of the file containing the symbol, e.g. 'src/lib/utils.ts'."),
        symbol_name: z
          .string()
          .min(1)
          .describe("Name of the symbol to find callers for."),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(async ({ path: filePath, symbol_name, project_id }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        return success("No project ID provided and no linked project found.", {
          projectId: null,
          path: filePath,
          symbolName: symbol_name,
          found: false,
          callers: [],
        });
      }

      const result = await client.request<SymbolUsagesResponse>(
        `/projects/${encodeURIComponent(resolvedProjectId)}/map/symbol-usages`,
        {
          authRequired: true,
          query: {
            symbolName: symbol_name,
            path: filePath,
          },
        },
      );

      const lines: string[] = [
        `Callers of '${symbol_name}' in ${filePath}`,
        `Symbol exported: ${result.target.isExported ? "yes" : "no"}`,
        `Confidence data: ${result.meta.source}, ${result.meta.staleness}, parse=${result.meta.parseStatus ?? "unknown"}`,
        "",
      ];

      if (result.callers.length === 0) {
        lines.push(
          result.target.isExported
            ? "No callers found. Symbol may be unused, entry-like, or used outside parsed code."
            : "No callers found. Symbol is not exported and has no parsed external usages.",
        );
      } else {
        lines.push(`Found ${result.callers.length} caller(s):`);
        for (const caller of result.callers.slice(0, 50)) {
          const names = caller.importedNames?.length
            ? ` { ${caller.importedNames.join(", ")} }`
            : "";
          const source =
            caller.moduleSpecifier !== undefined
              ? ` from '${caller.moduleSpecifier}'`
              : "";
          const snippet = caller.snippetPreview ? ` - ${caller.snippetPreview}` : "";
          lines.push(
            `  ${caller.filePath}:${formatRange(caller.range)} [${caller.confidence}/${caller.evidence}${names}${source}]${snippet}`,
          );
        }
      }

      return success(lines.join("\n"), {
        projectId: resolvedProjectId,
        path: filePath,
        symbolName: symbol_name,
        found: true,
        target: result.target,
        callers: result.callers,
        usages: result.usages,
        definitions: result.definitions,
        totalCallers: result.totals.callers,
        totalUsages: result.totals.usages,
        meta: result.meta,
      });
    }),
  );
}
