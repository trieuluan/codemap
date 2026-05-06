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
import {
  ensureLocalIndexWithSummary,
  shouldFallbackToLocal,
  shouldUseLocalIndexBeforeRemote,
} from "../lib/local-index.js";

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

function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s\-_/.,:]+/)
    .map((term) => term.replace(/[^a-z0-9]/g, ""))
    .filter((term) => term.length > 2);
}

function filename(path: string): string {
  return path.split("/").pop()?.toLowerCase() ?? path.toLowerCase();
}

function rankPath(path: string, terms: string[], baseRank: number): number {
  const lowerPath = path.toLowerCase();
  const lowerName = filename(path);
  let score = 100 - baseRank;

  for (const term of terms) {
    if (lowerName === `${term}.ts` || lowerName === `${term}.tsx`) score += 30;
    else if (lowerName.includes(term)) score += 18;
    if (lowerPath.includes(`/${term}/`)) score += 16;
    else if (lowerPath.includes(term)) score += 8;
  }

  if (lowerName === "loading.tsx" || lowerName === "error.tsx") score -= 35;
  if (lowerPath.includes("/node_modules/")) score -= 100;
  if (lowerPath.includes("/features/")) score += 4;
  if (lowerPath.includes("/routes/") || lowerPath.includes("/modules/")) score += 4;
  if (lowerPath.includes("/db/") || lowerPath.includes("/shared/src/")) score += 3;

  return score;
}

function rankName(name: string, terms: string[], baseRank: number): number {
  const lower = name.toLowerCase();
  let score = 100 - baseRank;
  for (const term of terms) {
    if (lower === term) score += 30;
    else if (lower.includes(term)) score += 18;
  }
  return score;
}

function rerankResults(
  query: string,
  results: CodebaseSearchResponse,
): CodebaseSearchResponse {
  const terms = queryTerms(query);
  return {
    ...results,
    files: [...results.files].sort(
      (a, b) =>
        rankPath(b.path, terms, results.files.indexOf(b)) -
        rankPath(a.path, terms, results.files.indexOf(a)),
    ),
    symbols: [...results.symbols].sort(
      (a, b) =>
        rankName(b.displayName, terms, results.symbols.indexOf(b)) +
          rankPath(b.filePath, terms, results.symbols.indexOf(b)) -
        (rankName(a.displayName, terms, results.symbols.indexOf(a)) +
          rankPath(a.filePath, terms, results.symbols.indexOf(a))),
    ),
    exports: [...results.exports].sort(
      (a, b) =>
        rankName(b.exportName, terms, results.exports.indexOf(b)) +
          rankPath(b.filePath, terms, results.exports.indexOf(b)) -
        (rankName(a.exportName, terms, results.exports.indexOf(a)) +
          rankPath(a.filePath, terms, results.exports.indexOf(a))),
    ),
  };
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
  } else {
    const visibleSymbols = kinds.has("symbols") ? results.symbols : [];
    const visibleFiles = kinds.has("files") ? results.files : [];
    const topFiles = [
      ...visibleSymbols.slice(0, 3).map((symbol) => symbol.filePath),
      ...visibleFiles.slice(0, 4).map((file) => file.path),
    ];
    const uniqueTopFiles = [...new Set(topFiles)].slice(0, 7);
    sections.push("\nBest next read:");
    if (visibleSymbols[0]) {
      sections.push(
        `→ get_symbol_context(symbol_name="${visibleSymbols[0].displayName}", file_path="${visibleSymbols[0].filePath}")`,
      );
    }
    if (uniqueTopFiles.length > 0) {
      sections.push(`→ get_files(${JSON.stringify(uniqueTopFiles)})`);
    }
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
        "Use this for narrow lookup when you know a keyword, filename, symbol, or export. " +
        "Search files, symbols, and exports by keyword to locate where things are defined or exported. " +
        "For broad implementation tasks use explore_task first; for related-file questions use find_related_files. " +
        "project_id is optional if workspace is linked.",
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
          .describe("Filter symbols by kind (function, class, method, etc.). Only used when kinds includes 'symbols'."),
      },
    },
    withToolError(async ({ query, project_id, kinds, symbol_kinds }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());
      const activeKinds = new Set(kinds ?? ["files", "symbols", "exports"]);

      if (!resolvedProjectId) {
        const { store, summary: localIndex } = await ensureLocalIndexWithSummary();
        const localResults = rerankResults(
          query,
          store.search(query, symbol_kinds ?? null),
        );
        const files = activeKinds.has("files") ? localResults.files : [];
        const symbols = activeKinds.has("symbols") ? localResults.symbols : [];
        const exports = activeKinds.has("exports") ? localResults.exports : [];
        const total = files.length + symbols.length + exports.length;

        return success(buildOutput(query, localResults, activeKinds), {
          projectId: null,
          query,
          source: "local",
          localIndex,
          kinds: Array.from(activeKinds),
          symbolKinds: symbol_kinds ?? null,
          files,
          symbols,
          exports,
          total,
          found: total > 0,
          suggestedNextTools:
            symbols.length > 0
              ? [
                  `get_symbol_context(symbol_name="${symbols[0].displayName}", file_path="${symbols[0].filePath}")`,
                  `get_file("${symbols[0].filePath}", include=["symbols"], symbol_names=["${symbols[0].displayName}"])`,
                ]
              : files.length > 0
                ? [`get_file("${files[0].path}", include=["outline"])`]
                : [],
        });
      }

      if (await shouldUseLocalIndexBeforeRemote(client, resolvedProjectId)) {
        const { store, summary: localIndex } = await ensureLocalIndexWithSummary();
        const localResults = rerankResults(
          query,
          store.search(query, symbol_kinds ?? null),
        );
        const files = activeKinds.has("files") ? localResults.files : [];
        const symbols = activeKinds.has("symbols") ? localResults.symbols : [];
        const exports = activeKinds.has("exports") ? localResults.exports : [];
        const total = files.length + symbols.length + exports.length;

        return success(buildOutput(query, localResults, activeKinds), {
          projectId: resolvedProjectId,
          query,
          source: "local",
          localIndex,
          kinds: Array.from(activeKinds),
          symbolKinds: symbol_kinds ?? null,
          files,
          symbols,
          exports,
          total,
          found: total > 0,
          suggestedNextTools:
            symbols.length > 0
              ? [
                  `get_symbol_context(symbol_name="${symbols[0].displayName}", file_path="${symbols[0].filePath}")`,
                  `get_file("${symbols[0].filePath}", include=["symbols"], symbol_names=["${symbols[0].displayName}"])`,
                ]
              : files.length > 0
                ? [`get_file("${files[0].path}", include=["outline"])`]
                : [],
        });
      }

      let results: CodebaseSearchResponse;
      let source: "remote" | "local" = "remote";
      let localIndexSummary: Awaited<ReturnType<typeof ensureLocalIndexWithSummary>>["summary"] | null = null;

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
        if (shouldFallbackToLocal(error)) {
          const { store, summary: localIndex } = await ensureLocalIndexWithSummary();
          results = store.search(query, symbol_kinds ?? null);
          source = "local";
          localIndexSummary = localIndex;
        } else {
          throw error;
        }
      }
      // Preserve current remote ranking and apply it to local fallback too.
      results = rerankResults(query, results);

      const files = activeKinds.has("files") ? results.files : [];
      const symbols = activeKinds.has("symbols") ? results.symbols : [];
      const exports = activeKinds.has("exports") ? results.exports : [];
      const total = files.length + symbols.length + exports.length;

      const suggestedNextTools: string[] = [];
      if (symbols.length > 0) {
        suggestedNextTools.push(
          `get_symbol_context(symbol_name="${symbols[0].displayName}", file_path="${symbols[0].filePath}")`,
        );
        suggestedNextTools.push(
          `get_file("${symbols[0].filePath}", include=["symbols"], symbol_names=["${symbols[0].displayName}"])`,
        );
      } else if (files.length > 0) {
        suggestedNextTools.push(`get_file("${files[0].path}", include=["outline"])`);
      }

      return success(buildOutput(query, results, activeKinds), {
        projectId: resolvedProjectId,
        query,
        source,
        ...(localIndexSummary ? { localIndex: localIndexSummary } : {}),
        kinds: Array.from(activeKinds),
        symbolKinds: symbol_kinds ?? null,
        files,
        symbols,
        exports,
        total,
        found: total > 0,
        suggestedNextTools,
      });
    }),
  );
}
