import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type {
  CodebaseSearchResponse,
  SearchExportResult,
  SearchFileResult,
  SearchSymbolResult,
} from "../lib/api-types.js";

const SYMBOL_KIND_VALUES = [
  "module",
  "namespace",
  "class",
  "interface",
  "trait",
  "mixin",
  "enum",
  "enum_member",
  "function",
  "component",
  "method",
  "constructor",
  "property",
  "field",
  "variable",
  "constant",
  "type_alias",
  "parameter",
] as const;

const SYMBOL_KIND_LABEL: Record<string, string> = {
  function: "fn",
  class: "class",
  interface: "interface",
  type_alias: "type",
  variable: "var",
  enum: "enum",
  namespace: "namespace",
  method: "method",
  property: "property",
};

function formatSymbolKind(kind: string): string {
  return SYMBOL_KIND_LABEL[kind] ?? kind.replace(/_/g, " ");
}

function formatFileResult(r: SearchFileResult, index: number): string {
  const lang = r.language ? ` [${r.language}]` : "";
  const hint = `\n   → get_file(path, include=["outline"])`;
  return `${index + 1}. ${r.path}${lang}${hint}`;
}

function formatSymbolResult(r: SearchSymbolResult, index: number): string {
  const kind = formatSymbolKind(r.symbolKind);
  const location = r.startLine ? `:${r.startLine}` : "";
  const parent = r.parentSymbolName ? ` (in ${r.parentSymbolName})` : "";
  const signature = r.signature ? `\n   \`${r.signature}\`` : "";
  const hint = `\n   → get_file(path, include=["symbols"], symbol_names=["${r.displayName}"])`;
  return `${index + 1}. ${r.displayName}  [${kind}]${parent}\n   ${r.filePath}${location}${signature}${hint}`;
}

function formatExportResult(r: SearchExportResult, index: number): string {
  const hint = `\n   → get_file(path, include=["symbols"], symbol_names=["${r.exportName}"])`;
  return `${index + 1}. ${r.exportName}\n   ${r.filePath}:${r.startLine}${hint}`;
}

function buildOutput(
  query: string,
  results: CodebaseSearchResponse,
  kinds: Set<string>,
): string {
  const sections: string[] = [`Search results for: "${query}"\n`];
  let totalCount = 0;

  if (kinds.has("files") && results.files.length > 0) {
    sections.push(`Files (${results.files.length}):`);
    sections.push(results.files.map(formatFileResult).join("\n"));
    totalCount += results.files.length;
  }

  if (kinds.has("symbols") && results.symbols.length > 0) {
    sections.push(`\nSymbols (${results.symbols.length}):`);
    sections.push(results.symbols.map(formatSymbolResult).join("\n"));
    totalCount += results.symbols.length;
  }

  if (kinds.has("exports") && results.exports.length > 0) {
    sections.push(`\nExports (${results.exports.length}):`);
    sections.push(results.exports.map(formatExportResult).join("\n"));
    totalCount += results.exports.length;
  }

  if (totalCount === 0) {
    sections.push("No results found.");
  }

  return sections.join("\n");
}

export function registerSearchCodebaseTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "search_codebase",
    {
      title: "Search Codebase",
      description:
        "Full-text search across files, symbols, and exports in a CodeMap project. " +
        "Returns matching file paths, symbol definitions (functions, classes, interfaces, etc.), " +
        "and exported names. Use this to locate where things are defined or exported in the codebase. " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        query: z.string().min(1).describe("Search query string."),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "CodeMap project UUID. Auto-resolved from workspace if omitted.",
          ),
        kinds: z
          .array(z.enum(["files", "symbols", "exports"]))
          .optional()
          .describe(
            "Which result types to include. Defaults to all: files, symbols, exports.",
          ),
        symbol_kinds: z
          .array(z.enum(SYMBOL_KIND_VALUES))
          .optional()
          .describe(
            "Filter symbol results by kind. Only applies when 'symbols' is included in kinds. " +
            "Valid values: module, namespace, class, interface, trait, mixin, enum, enum_member, " +
            "function, component, method, constructor, property, field, variable, constant, type_alias, parameter.",
          ),
      },
    },
    withToolError(async ({ query, project_id, kinds, symbol_kinds }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        const summary =
          "No project ID provided and no linked project found for this workspace.\n" +
          "Run create_project first to link this workspace to a CodeMap project.";

        return success(summary, {
          projectId: null,
          query,
          kinds: kinds ?? ["files", "symbols", "exports"],
          symbolKinds: symbol_kinds ?? null,
          files: [],
          symbols: [],
          exports: [],
          total: 0,
          found: false,
        });
      }

      const activeKinds = new Set(kinds ?? ["files", "symbols", "exports"]);

      let results: CodebaseSearchResponse;

      try {
        const searchQuery: Record<string, string> = { q: query };
        if (symbol_kinds && symbol_kinds.length > 0) {
          searchQuery.symbolKinds = symbol_kinds.join(",");
        }

        results = await client.request<CodebaseSearchResponse>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
          {
            authRequired: true,
            query: searchQuery,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("404")) {
          const summary =
            `Project not found: ${resolvedProjectId}\n` +
            "Check that the project ID is correct and the project has been imported.";

          return success(summary, {
            projectId: resolvedProjectId,
            query,
            kinds: Array.from(activeKinds),
            symbolKinds: symbol_kinds ?? null,
            files: [],
            symbols: [],
            exports: [],
            total: 0,
            found: false,
          });
        }

        throw error;
      }

      const files = activeKinds.has("files") ? results.files : [];
      const symbols = activeKinds.has("symbols") ? results.symbols : [];
      const exports = activeKinds.has("exports") ? results.exports : [];
      const total = files.length + symbols.length + exports.length;

      return success(buildOutput(query, results, activeKinds), {
        projectId: resolvedProjectId,
        query,
        kinds: Array.from(activeKinds),
        symbolKinds: symbol_kinds ?? null,
        files,
        symbols,
        exports,
        total,
        found: total > 0,
      });
    }),
  );
}
