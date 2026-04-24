import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { text, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type {
  CodebaseSearchResponse,
  SearchExportResult,
  SearchFileResult,
  SearchSymbolResult,
} from "../lib/api-types.js";

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
  return `${index + 1}. ${r.path}${lang}`;
}

function formatSymbolResult(r: SearchSymbolResult, index: number): string {
  const kind = formatSymbolKind(r.symbolKind);
  const location = r.startLine ? `:${r.startLine}` : "";
  const parent = r.parentSymbolName ? ` (in ${r.parentSymbolName})` : "";
  return `${index + 1}. ${r.displayName}  [${kind}]${parent}\n   ${r.filePath}${location}`;
}

function formatExportResult(r: SearchExportResult, index: number): string {
  return `${index + 1}. ${r.exportName}\n   ${r.filePath}:${r.startLine}`;
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
      },
    },
    withToolError(async ({ query, project_id, kinds }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        return text(
          "No project ID provided and no linked project found for this workspace.\n" +
            "Run create_project first to link this workspace to a CodeMap project.",
        );
      }

      const activeKinds = new Set(kinds ?? ["files", "symbols", "exports"]);

      let results: CodebaseSearchResponse;

      try {
        results = await client.request<CodebaseSearchResponse>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
          {
            authRequired: true,
            query: { q: query },
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("404")) {
          return text(
            `Project not found: ${resolvedProjectId}\n` +
              "Check that the project ID is correct and the project has been imported.",
          );
        }

        throw error;
      }

      return text(buildOutput(query, results, activeKinds));
    }),
  );
}
