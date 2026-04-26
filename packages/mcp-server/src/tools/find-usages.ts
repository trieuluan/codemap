import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type { SearchSymbolResult, SearchExportResult } from "../lib/api-types.js";

interface CodebaseSearchResponse {
  files: unknown[];
  symbols: SearchSymbolResult[];
  exports: SearchExportResult[];
}

interface ParseImportedBy {
  sourceFilePath: string;
  moduleSpecifier: string;
  importKind: string;
  startLine: number;
}

interface ParseSymbol {
  displayName: string;
  kind: string;
  startLine: number | null;
  isExported: boolean;
}

interface ParseExport {
  exportName: string;
  exportKind: string;
  symbolDisplayName: string | null;
  startLine: number;
}

interface FileParseResponse {
  file: { path: string; language: string | null; lineCount: number | null };
  importedBy: ParseImportedBy[];
  symbols: ParseSymbol[];
  exports: ParseExport[];
}

export function registerFindUsagesTool(server: McpServer, config: McpServerConfig) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "find_usages",
    {
      title: "Find Usages",
      description:
        "Find all known usages of a symbol across the codebase. " +
        "Returns: (1) definition location, (2) files that import the containing file. " +
        "Note: this is file-level usage tracking — it shows which files import the symbol's file, " +
        "not exact call sites within those files. " +
        "Use find_callers for a focused single-file lookup. " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        symbol_name: z
          .string()
          .min(1)
          .describe("Name of the symbol to find usages for."),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(async ({ symbol_name, project_id }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        return success("No project ID provided and no linked project found.", {
          projectId: null, symbolName: symbol_name, found: false, usages: [],
        });
      }

      // Search for the symbol across codebase
      const searchResult = await client.request<CodebaseSearchResponse>(
        `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
        { authRequired: true, query: { q: symbol_name } },
      );

      const exactSymbols = searchResult.symbols.filter(
        (s) => s.displayName === symbol_name,
      );
      const exactExports = searchResult.exports.filter(
        (e) => e.exportName === symbol_name,
      );

      if (exactSymbols.length === 0 && exactExports.length === 0) {
        return success(`Symbol '${symbol_name}' not found in codebase.`, {
          projectId: resolvedProjectId,
          symbolName: symbol_name,
          found: false,
          definitions: [],
          importedBy: [],
        });
      }

      // Fetch importedBy for each file where symbol is defined
      const definitionFiles = [
        ...new Set(exactSymbols.map((s) => s.filePath).filter(Boolean)),
      ];

      const importedByResults = await Promise.allSettled(
        definitionFiles.map((filePath) =>
          client.request<FileParseResponse>(
            `/projects/${encodeURIComponent(resolvedProjectId)}/map/files/parse`,
            { authRequired: true, query: { path: filePath } },
          ),
        ),
      );

      const allImportedBy: Array<{ definedIn: string; callerFile: string; moduleSpecifier: string; importKind: string; startLine: number }> = [];

      for (let i = 0; i < definitionFiles.length; i++) {
        const result = importedByResults[i];
        const defFile = definitionFiles[i];
        if (result.status === "fulfilled" && defFile) {
          for (const imp of result.value.importedBy) {
            allImportedBy.push({
              definedIn: defFile,
              callerFile: imp.sourceFilePath,
              moduleSpecifier: imp.moduleSpecifier,
              importKind: imp.importKind,
              startLine: imp.startLine,
            });
          }
        }
      }

      // Build output
      const lines: string[] = [`Usages of '${symbol_name}'`, ""];

      // Definitions
      lines.push(`## Definitions (${exactSymbols.length})`);
      if (exactSymbols.length === 0) {
        lines.push("  (none found — may be re-exported only)");
      } else {
        for (const sym of exactSymbols) {
          lines.push(`  ${sym.filePath}:${sym.startLine ?? "?"} [${sym.symbolKind}]`);
          if (sym.signature) lines.push(`  \`${sym.signature}\``);
        }
      }

      // Exports
      if (exactExports.length > 0) {
        lines.push("", `## Exports (${exactExports.length})`);
        for (const exp of exactExports) {
          lines.push(`  ${exp.filePath}:${exp.startLine}`);
        }
      }

      // Callers (file-level)
      lines.push("", `## Files importing this symbol's file (${allImportedBy.length})`);
      if (allImportedBy.length === 0) {
        lines.push("  No callers found — symbol may be dead code or entry point.");
      } else {
        for (const usage of allImportedBy) {
          lines.push(`  ${usage.callerFile}:${usage.startLine} ← '${usage.moduleSpecifier}'`);
        }
      }

      return success(lines.join("\n"), {
        projectId: resolvedProjectId,
        symbolName: symbol_name,
        found: true,
        definitions: exactSymbols.map((s) => ({
          filePath: s.filePath,
          startLine: s.startLine,
          kind: s.symbolKind,
          signature: s.signature,
        })),
        importedBy: allImportedBy,
        totalCallers: allImportedBy.length,
      });
    }),
  );
}
