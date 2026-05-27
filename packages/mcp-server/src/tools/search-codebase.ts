import { z } from "zod";
import { uuidSchema } from "../lib/uuid-schema.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import {
  buildToolEnvelope,
  normalizeLimit,
  normalizeMaxChars,
  normalizeVerbosity,
  success,
  truncateText,
  withToolError,
} from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type {
  CodebaseSearchResponse,
  SearchExportResult,
  SearchFileResult,
  SearchSymbolResult,
  SemanticSearchResult,
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
  if (lowerPath.includes("/routes/") || lowerPath.includes("/modules/"))
    score += 4;
  if (lowerPath.includes("/db/") || lowerPath.includes("/shared/src/"))
    score += 3;

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

function formatSemanticResult(r: SemanticSearchResult, index: number): string {
  const location = r.startLine ? `:${r.startLine}` : "";
  const symbol = r.symbolName ? `  [${r.symbolName}]` : "";
  const score = `  score=${r.score.toFixed(2)}`;
  const snippet = r.snippet
    ? `\n   ${r.snippet.split("\n")[0].slice(0, 120)}`
    : "";
  const hint = `\n   → get_file("${r.path}", include=["outline"])`;
  return `${index + 1}. ${r.path}${location}${symbol}${score}${snippet}${hint}`;
}

function compactItemFromFile(r: SearchFileResult) {
  return {
    type: "file",
    path: r.path,
    language: r.language ?? undefined,
    reason: "keyword match",
  };
}

function compactItemFromSymbol(r: SearchSymbolResult) {
  return {
    type: "symbol",
    path: r.filePath,
    symbol: r.displayName,
    kind: formatSymbolKind(r.symbolKind),
    line: r.startLine ?? undefined,
    reason: "symbol match",
  };
}

function compactItemFromExport(r: SearchExportResult) {
  return {
    type: "export",
    path: r.filePath,
    symbol: r.exportName,
    line: r.startLine ?? undefined,
    reason: "export match",
  };
}

function compactItemFromSemantic(r: SemanticSearchResult) {
  return {
    type: "semantic",
    path: r.path,
    symbol: r.symbolName ?? undefined,
    line: r.startLine ?? undefined,
    score: Number(r.score.toFixed(3)),
    reason: "semantic match",
    snippet: r.snippet ? r.snippet.split("\n")[0].slice(0, 120) : undefined,
  };
}

function buildSearchEnvelope(
  query: string,
  results: CodebaseSearchResponse,
  kinds: Set<string>,
  options: {
    verbosity?: string;
    limit?: number;
    max_chars?: number;
    include_raw?: boolean;
  },
  semanticResults?: SemanticSearchResult[],
) {
  const verbosity = normalizeVerbosity(options.verbosity);
  const limit = normalizeLimit(options.limit, 10);
  const maxChars = normalizeMaxChars(options.max_chars, 12000);
  const files = kinds.has("files") ? results.files : [];
  const symbols = kinds.has("symbols") ? results.symbols : [];
  const exports = kinds.has("exports") ? results.exports : [];
  const rawItems = [
    ...symbols.map(compactItemFromSymbol),
    ...files.map(compactItemFromFile),
    ...exports.map(compactItemFromExport),
    ...(semanticResults ?? []).map(compactItemFromSemantic),
  ];
  const total = rawItems.length;
  const items = rawItems.slice(0, limit);
  const topPaths = [
    ...new Set(items.map((item) => item.path).filter(Boolean)),
  ].slice(0, 7);
  const nextActions = symbols[0]
    ? [
        `symbol(action="context", symbol_name="${symbols[0].displayName}", file_path="${symbols[0].filePath}")`,
        `get_file("${symbols[0].filePath}", include=["symbols"], symbol_names=["${symbols[0].displayName}"])`,
      ]
    : topPaths[0]
      ? [`get_file(${JSON.stringify(topPaths)})`]
      : [];
  const summary =
    total === 0
      ? `No results found for "${query}".`
      : `Found ${total} result(s) for "${query}"; returning top ${items.length}.`;
  const longDisplay = buildOutput(query, results, kinds, semanticResults);
  const display =
    verbosity === "compact"
      ? summary
      : truncateText(longDisplay, maxChars).text;
  const truncated =
    total > items.length ||
    (verbosity !== "compact" && longDisplay.length > maxChars);

  return buildToolEnvelope({
    summary,
    items,
    nextActions,
    truncated,
    truncationReason: truncated
      ? total > items.length
        ? "limit exceeded"
        : "max_chars exceeded"
      : undefined,
    meta: {
      verbosity,
      total,
      returned: items.length,
      limit,
      max_chars: maxChars,
    },
    agentHints: {
      recommendedNextTool: symbols[0]
        ? "symbol"
        : topPaths.length
          ? "get_file"
          : undefined,
      recommendedPaths: topPaths,
      avoidReadingFullFiles: true,
    },
    display,
    raw:
      options.include_raw || verbosity === "debug"
        ? { results, semanticResults }
        : undefined,
  });
}

function buildOutput(
  query: string,
  results: CodebaseSearchResponse,
  kinds: Set<string>,
  semanticResults?: SemanticSearchResult[],
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

  if (semanticResults && semanticResults.length > 0) {
    sections.push(`\nSemantic matches (${semanticResults.length}):`);
    sections.push(semanticResults.map(formatSemanticResult).join("\n"));
    totalCount += semanticResults.length;
  }

  if (totalCount === 0) {
    sections.push("No results found.");
  } else {
    const visibleSymbols = kinds.has("symbols") ? results.symbols : [];
    const visibleFiles = kinds.has("files") ? results.files : [];
    const topFiles = [
      ...visibleSymbols.slice(0, 3).map((symbol) => symbol.filePath),
      ...visibleFiles.slice(0, 4).map((file) => file.path),
      ...(semanticResults ?? []).slice(0, 3).map((r) => r.path),
    ];
    const uniqueTopFiles = [...new Set(topFiles)].slice(0, 7);
    sections.push("\nBest next read:");
    if (visibleSymbols[0]) {
      sections.push(
        `→ symbol(action="context", symbol_name="${visibleSymbols[0].displayName}", file_path="${visibleSymbols[0].filePath}")`,
      );
    }
    if (uniqueTopFiles.length > 0) {
      sections.push(`→ get_file(${JSON.stringify(uniqueTopFiles)})`);
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
        "Search for symbols, functions, classes, exports, or keywords in the indexed codebase. " +
        "Use this INSTEAD OF grep/rg/awk for any source file lookup — faster and more accurate. " +
        "Returns ranked results with file paths and line numbers. " +
        "Use for narrow lookup when you know a keyword, filename, symbol, or export name. " +
        "Pass semantic=true to also run embedding-based search alongside keyword search — " +
        "useful when the query is conceptual ('authentication flow', 'error handling') rather than an exact symbol name. " +
        "For broad implementation tasks use explore_task first; for related-file questions use find_related_files. " +
        "project_id is optional if workspace is linked.",
      inputSchema: {
        query: z.string().min(1).describe("Search query string."),
        project_id: uuidSchema
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
            "Filter symbols by kind (function, class, method, etc.). Only used when kinds includes 'symbols'.",
          ),
        semantic: z
          .boolean()
          .optional()
          .describe(
            "Also run semantic (embedding) search alongside keyword search. " +
              "Use when query is conceptual ('authentication flow', 'error handling') rather than a known symbol name. " +
              "Requires embeddings to be indexed. Ignored if no project is linked.",
          ),
        verbosity: z
          .enum(["compact", "normal", "verbose", "debug"])
          .optional()
          .default("compact"),
        limit: z.number().int().min(1).max(100).optional().default(10),
        max_chars: z
          .number()
          .int()
          .min(500)
          .max(50000)
          .optional()
          .default(12000),
        include_raw: z.boolean().optional().default(false),
      },
    },
    withToolError(
      async ({
        query,
        project_id,
        kinds,
        symbol_kinds,
        semantic,
        verbosity,
        limit,
        max_chars,
        include_raw,
      }) => {
        const resolvedProjectId =
          project_id ?? (await readWorkspaceProjectId());
        const activeKinds = new Set(kinds ?? ["files", "symbols", "exports"]);

        if (!resolvedProjectId) {
          const { store, summary: localIndex } =
            await ensureLocalIndexWithSummary();
          const localResults = rerankResults(
            query,
            store.search(query, symbol_kinds ?? null),
          );
          const files = activeKinds.has("files") ? localResults.files : [];
          const symbols = activeKinds.has("symbols")
            ? localResults.symbols
            : [];
          const exports = activeKinds.has("exports")
            ? localResults.exports
            : [];
          const total = files.length + symbols.length + exports.length;

          const envelope = buildSearchEnvelope(
            query,
            localResults,
            activeKinds,
            { verbosity, limit, max_chars, include_raw },
          );
          return success(envelope.display ?? envelope.summary, {
            ...envelope,
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
                    `symbol(action="context", symbol_name="${symbols[0].displayName}", file_path="${symbols[0].filePath}")`,
                    `get_file("${symbols[0].filePath}", include=["symbols"], symbol_names=["${symbols[0].displayName}"])`,
                  ]
                : files.length > 0
                  ? [`get_file("${files[0].path}", include=["outline"])`]
                  : [],
          });
        }

        if (await shouldUseLocalIndexBeforeRemote(client, resolvedProjectId)) {
          const { store, summary: localIndex } =
            await ensureLocalIndexWithSummary();
          const localResults = rerankResults(
            query,
            store.search(query, symbol_kinds ?? null),
          );
          const files = activeKinds.has("files") ? localResults.files : [];
          const symbols = activeKinds.has("symbols")
            ? localResults.symbols
            : [];
          const exports = activeKinds.has("exports")
            ? localResults.exports
            : [];
          const total = files.length + symbols.length + exports.length;

          const envelope = buildSearchEnvelope(
            query,
            localResults,
            activeKinds,
            { verbosity, limit, max_chars, include_raw },
          );
          return success(envelope.display ?? envelope.summary, {
            ...envelope,
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
                    `symbol(action="context", symbol_name="${symbols[0].displayName}", file_path="${symbols[0].filePath}")`,
                    `get_file("${symbols[0].filePath}", include=["symbols"], symbol_names=["${symbols[0].displayName}"])`,
                  ]
                : files.length > 0
                  ? [`get_file("${files[0].path}", include=["outline"])`]
                  : [],
          });
        }

        let results: CodebaseSearchResponse;
        let source: "remote" | "local" = "remote";
        let localIndexSummary:
          | Awaited<ReturnType<typeof ensureLocalIndexWithSummary>>["summary"]
          | null = null;
        let semanticResults: SemanticSearchResult[] = [];

        try {
          const searchQuery: Record<string, string> = { q: query };
          if (symbol_kinds && symbol_kinds.length > 0) {
            searchQuery.symbolKinds = symbol_kinds.join(",");
          }

          const [keywordResult, semanticResult] = await Promise.allSettled([
            client.request<CodebaseSearchResponse>(
              `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
              { authRequired: true, query: searchQuery },
            ),
            semantic
              ? client.request<SemanticSearchResult[]>(
                  `/projects/${encodeURIComponent(resolvedProjectId)}/map/search/semantic`,
                  { authRequired: true, query: { q: query, limit: "10" } },
                )
              : Promise.resolve([] as SemanticSearchResult[]),
          ]);

          if (keywordResult.status === "rejected") throw keywordResult.reason;
          results = keywordResult.value;

          if (
            semanticResult.status === "fulfilled" &&
            Array.isArray(semanticResult.value)
          ) {
            // Dedup: exclude paths already covered by keyword results
            const keywordPaths = new Set([
              ...results.files.map((f) => f.path),
              ...results.symbols.map((s) => s.filePath),
            ]);
            semanticResults = semanticResult.value.filter(
              (r) => !keywordPaths.has(r.path),
            );
          }
        } catch (error) {
          if (shouldFallbackToLocal(error)) {
            const { store, summary: localIndex } =
              await ensureLocalIndexWithSummary();
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
        const total =
          files.length +
          symbols.length +
          exports.length +
          semanticResults.length;

        const suggestedNextTools: string[] = [];
        if (symbols.length > 0) {
          suggestedNextTools.push(
            `symbol(action="context", symbol_name="${symbols[0].displayName}", file_path="${symbols[0].filePath}")`,
          );
          suggestedNextTools.push(
            `get_file("${symbols[0].filePath}", include=["symbols"], symbol_names=["${symbols[0].displayName}"])`,
          );
        } else if (files.length > 0) {
          suggestedNextTools.push(
            `get_file("${files[0].path}", include=["outline"])`,
          );
        } else if (semanticResults[0]) {
          suggestedNextTools.push(
            `get_file("${semanticResults[0].path}", include=["outline"])`,
          );
        }

        const envelope = buildSearchEnvelope(
          query,
          results,
          activeKinds,
          { verbosity, limit, max_chars, include_raw },
          semanticResults.length ? semanticResults : undefined,
        );
        return success(envelope.display ?? envelope.summary, {
          ...envelope,
          projectId: resolvedProjectId,
          query,
          source,
          ...(localIndexSummary ? { localIndex: localIndexSummary } : {}),
          kinds: Array.from(activeKinds),
          symbolKinds: symbol_kinds ?? null,
          semantic: semantic ?? false,
          files,
          symbols,
          exports,
          semanticMatches: semanticResults,
          total,
          found: total > 0,
          suggestedNextTools,
        });
      },
    ),
  );
}
