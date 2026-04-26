import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";

interface ParseImportedBy {
  id: string;
  sourceFileId: string;
  sourceFilePath: string;
  moduleSpecifier: string;
  importKind: string;
  importedNames: string[];
  resolutionKind: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

interface ParseExport {
  id: string;
  exportName: string;
  exportKind: string;
  symbolDisplayName: string | null;
  startLine: number;
}

interface ParseSymbol {
  id: string;
  displayName: string;
  kind: string;
  startLine: number | null;
}

interface FileParseResponse {
  file: { path: string; language: string | null };
  importedBy: ParseImportedBy[];
  exports: ParseExport[];
  symbols: ParseSymbol[];
}

export function registerFindCallersTool(server: McpServer, config: McpServerConfig) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "find_callers",
    {
      title: "Find Callers",
      description:
        "Find all files that import a specific symbol from a given file. " +
        "Returns file-level callers — files that have an import statement pointing to the source file " +
        "and importing the specified symbol name. " +
        "Useful for understanding impact before refactoring, and for dead code detection " +
        "(if result is empty, the symbol has no callers and may be dead code). " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Repository-relative path of the file containing the symbol, e.g. 'src/lib/utils.ts'."),
        symbol_name: z
          .string()
          .min(1)
          .describe("Name of the symbol to find callers for. Case-sensitive."),
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
          projectId: null, path: filePath, symbolName: symbol_name, found: false, callers: [],
        });
      }

      const parse = await client.request<FileParseResponse>(
        `/projects/${encodeURIComponent(resolvedProjectId)}/map/files/parse`,
        { authRequired: true, query: { path: filePath } },
      );

      // Verify symbol exists in this file
      const symbol = parse.symbols.find(
        (s) => s.displayName === symbol_name,
      );
      const exportEntry = parse.exports.find(
        (e) => (e.symbolDisplayName ?? e.exportName) === symbol_name,
      );

      if (!symbol && !exportEntry) {
        const output = [
          `Symbol '${symbol_name}' not found in ${filePath}.`,
          "",
          `Available symbols: ${parse.symbols.map((s) => s.displayName).join(", ") || "(none)"}`,
        ].join("\n");

        return success(output, {
          projectId: resolvedProjectId,
          path: filePath,
          symbolName: symbol_name,
          found: false,
          callers: [],
        });
      }

      // Filter importedBy to those that actually import this symbol by name.
      // If importedNames is empty (wildcard/default/dynamic import), include as potential caller.
      const callers = parse.importedBy
        .filter((imp) =>
          imp.importedNames.length === 0 ||
          imp.importedNames.some((n) => n.toLowerCase() === symbol_name.toLowerCase()),
        )
        .map((imp) => ({
          filePath: imp.sourceFilePath,
          moduleSpecifier: imp.moduleSpecifier,
          importKind: imp.importKind,
          importedNames: imp.importedNames,
          startLine: imp.startLine,
          startCol: imp.startCol,
        }));

      const isExported = Boolean(exportEntry);
      const lines: string[] = [
        `Callers of '${symbol_name}' in ${filePath}`,
        `Symbol exported: ${isExported ? "yes" : "no (not exported — only accessible within file)"}`,
        "",
      ];

      if (callers.length === 0) {
        lines.push(isExported
          ? "No callers found — this symbol may be dead code or used only externally."
          : "No callers found — symbol is not exported and not referenced from other files.");
      } else {
        lines.push(`Found ${callers.length} caller(s):`);
        for (const caller of callers) {
          const names = caller.importedNames.length > 0 ? ` { ${caller.importedNames.join(", ")} }` : "";
          lines.push(`  ${caller.filePath}:${caller.startLine} (${caller.importKind}${names}: '${caller.moduleSpecifier}')`);
        }
      }

      return success(lines.join("\n"), {
        projectId: resolvedProjectId,
        path: filePath,
        symbolName: symbol_name,
        found: true,
        isExported,
        callers,
        totalCallers: callers.length,
      });
    }),
  );
}
