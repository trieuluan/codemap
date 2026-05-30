import { z } from "zod";
import { uuidSchema } from "@codemap/core/lib/uuid-schema.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "@codemap/core/config.js";
import { createCodeMapClient } from "@codemap/core/lib/codemap-api.js";
import { success, withToolError } from "@codemap/core/lib/tool-response.js";
import { readWorkspaceProjectId } from "@codemap/core/lib/workspace-project.js";
import type {
  CodebaseSearchResponse,
  FileContent,
  SearchSymbolResult,
  SemanticSearchResult,
  SymbolUsagesResponse,
} from "@codemap/core/lib/api-types.js";
import {
  ensureLocalIndexWithSummary,
  isCloudContentEmpty,
  shouldFallbackToLocal,
  shouldUseLocalIndexBeforeRemote,
} from "@codemap/core/lib/local-index.js";
import { markdownFenceStart } from "@codemap/core/lib/markdown-fence.js";

interface ParseImport {
  moduleSpecifier: string;
  importKind: string;
  isResolved: boolean;
  targetPathText: string | null;
  startLine: number;
}

interface ParseImportedBy {
  sourceFilePath: string;
  importKind: string;
  startLine: number;
}

interface ParseExport {
  exportName: string;
  exportKind: string;
  symbolDisplayName: string | null;
  startLine: number;
}

interface ParseSymbol {
  id: string;
  displayName: string;
  kind: string;
  signature: string | null;
  returnType: string | null;
  isExported: boolean;
  parentSymbolName: string | null;
  startLine: number | null;
  endLine: number | null;
}

interface FileParseResponse {
  imports: ParseImport[];
  importedBy: ParseImportedBy[];
  exports: ParseExport[];
  symbols: ParseSymbol[];
}

function chooseSymbol(
  symbols: SearchSymbolResult[],
  symbolName: string,
  filePath?: string,
) {
  const lowerName = symbolName.toLowerCase();
  const filtered = filePath
    ? symbols.filter((symbol) => symbol.filePath === filePath)
    : symbols;

  return (
    filtered.find((symbol) => symbol.displayName.toLowerCase() === lowerName) ??
    filtered.find((symbol) =>
      symbol.displayName.toLowerCase().includes(lowerName),
    ) ??
    filtered[0] ??
    null
  );
}

function formatSymbolCall(symbol: SearchSymbolResult) {
  return `get_file("${symbol.filePath}", include=["symbols"], symbol_names=["${symbol.displayName}"])`;
}

function buildOutput(input: {
  symbolName: string;
  symbol: SearchSymbolResult;
  content: FileContent | null;
  parse: FileParseResponse | null;
  range: { startLine: number | null; endLine: number | null };
}) {
  const { symbolName, symbol, content, parse, range } = input;
  const lines = [`# Symbol context: ${symbol.displayName}`, ""];
  const loc = range.startLine
    ? `${symbol.filePath}:${range.startLine}${range.endLine ? `-${range.endLine}` : ""}`
    : symbol.filePath;

  lines.push(`Location: ${loc}`);
  lines.push(`Kind: ${symbol.symbolKind}`);
  if (symbol.parentSymbolName) lines.push(`Parent: ${symbol.parentSymbolName}`);
  if (symbol.signature) lines.push(`Signature: \`${symbol.signature}\``);

  lines.push("");
  lines.push("## Body");
  if (content?.content) {
    lines.push(markdownFenceStart(content));
    lines.push(content.content.trimEnd());
    lines.push("```");
  } else {
    lines.push("_Body unavailable. Fall back to get_file with content._");
  }

  if (parse) {
    const matchingSymbols = parse.symbols
      .filter((candidate) =>
        candidate.displayName.toLowerCase().includes(symbolName.toLowerCase()),
      )
      .slice(0, 8);

    lines.push("");
    lines.push("## Nearby outline");
    if (matchingSymbols.length > 0) {
      lines.push("Symbols matching the same name:");
      for (const candidate of matchingSymbols) {
        const candidateLoc = candidate.startLine ? `:${candidate.startLine}` : "";
        const exported = candidate.isExported ? " · exported" : "";
        lines.push(
          `- ${candidate.displayName} [${candidate.kind}]${candidateLoc}${exported}`,
        );
      }
    }

    if (parse.imports.length > 0) {
      lines.push("");
      lines.push("Top imports:");
      for (const imp of parse.imports.slice(0, 8)) {
        const target = imp.targetPathText ?? imp.moduleSpecifier;
        lines.push(`- ${imp.moduleSpecifier} -> ${target}`);
      }
    }

    if (parse.importedBy.length > 0) {
      lines.push("");
      lines.push("Imported by:");
      for (const importedBy of parse.importedBy.slice(0, 8)) {
        lines.push(`- ${importedBy.sourceFilePath}`);
      }
    }

    if (parse.exports.length > 0) {
      lines.push("");
      lines.push("Exports:");
      for (const exp of parse.exports.slice(0, 8)) {
        const name = exp.symbolDisplayName ?? exp.exportName;
        lines.push(`- ${name} (${exp.exportKind})`);
      }
    }
  }

  lines.push("");
  lines.push("## Next tool calls");
  lines.push(`- ${formatSymbolCall(symbol)}  // same symbol through get_file`);
  lines.push(`- symbol(action="usages", symbol_name="${symbol.displayName}")  // callers and references`);
  lines.push(`- get_file("${symbol.filePath}", include=["outline"])  // full file outline only`);

  return lines.join("\n");
}



function formatUsageRange(range: { startLine: number; startCol: number } | null) {
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
  return `  ${usage.filePath}:${formatUsageRange(usage.range)} [${usage.confidence}/${label}]${snippet}`;
}

async function findSymbolUsages(
  client: ReturnType<typeof createCodeMapClient>,
  symbolName: string,
  projectId?: string,
) {
  const resolvedProjectId = projectId ?? (await readWorkspaceProjectId());
  if (!resolvedProjectId) {
    return success("No project ID provided and no linked project found.", {
      projectId: null,
      symbolName,
      found: false,
      definitions: [],
      usages: [],
      callers: [],
    });
  }

  const searchResult = await client.request<CodebaseSearchResponse>(
    `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
    { authRequired: true, query: { q: symbolName } },
  );
  const exactSymbols = searchResult.symbols.filter(
    (symbol): symbol is SearchSymbolResult =>
      symbol.displayName === symbolName && Boolean(symbol.id),
  );
  if (exactSymbols.length === 0) {
    return success(`Symbol '${symbolName}' not found in codebase.`, {
      projectId: resolvedProjectId,
      symbolName,
      found: false,
      definitions: [],
      usages: [],
      callers: [],
    });
  }

  const usageResults = await Promise.all(
    exactSymbols.map((symbol) =>
      client.request<SymbolUsagesResponse>(
        `/projects/${encodeURIComponent(resolvedProjectId)}/map/symbols/${encodeURIComponent(symbol.id)}/usages`,
        { authRequired: true },
      ),
    ),
  );

  const lines: string[] = [`Usages of '${symbolName}'`, `Matched symbols: ${usageResults.length}`, ""];
  for (const result of usageResults) {
    const target = result.target;
    lines.push(`## ${target.displayName} (${target.symbolKind}) in ${target.filePath ?? "(unknown file)"}:${formatUsageRange(target.range)}`);
    if (target.signature) lines.push(`  ${target.signature}`);
    lines.push(`  Confidence data: ${result.meta.source}, ${result.meta.staleness}, parse=${result.meta.parseStatus ?? "unknown"}`);
    lines.push("", `  Definitions (${result.totals.definitions})`);
    if (result.definitions.length === 0) lines.push("  (none)");
    else for (const definition of result.definitions.slice(0, 10)) lines.push(formatUsageLine(definition));
    lines.push("", `  Occurrence usages (${result.totals.usages})`);
    if (result.usages.length === 0) lines.push("  (none)");
    else for (const usage of result.usages.slice(0, 25)) lines.push(formatUsageLine(usage));
    lines.push("", `  Callers (${result.totals.callers})`);
    if (result.callers.length === 0) lines.push("  No callers found.");
    else for (const caller of result.callers.slice(0, 25)) lines.push(formatUsageLine(caller));
    lines.push("");
  }
  const totalUsages = usageResults.reduce((sum, item) => sum + item.totals.usages, 0);
  const totalCallers = usageResults.reduce((sum, item) => sum + item.totals.callers, 0);
  const defFile = usageResults[0]?.target.filePath;
  const topCaller = usageResults[0]?.callers[0]?.filePath;
  const suggestedNextTools: string[] = [];
  if (defFile) suggestedNextTools.push(`get_file("${defFile}", include=["symbols"], symbol_names=["${symbolName}"])`);
  if (topCaller && topCaller !== defFile) suggestedNextTools.push(`get_file("${topCaller}", include=["outline"])`);
  if (totalCallers > 5 && defFile) suggestedNextTools.push(`move_symbols(from="${defFile}", to="<destination>", symbols=["${symbolName}"])  // refactor to different module`);
  suggestedNextTools.push("diff()  // after making changes");

  return success(lines.join("\n").trim(), {
    projectId: resolvedProjectId,
    symbolName,
    found: true,
    results: usageResults,
    totalDefinitions: usageResults.reduce((sum, item) => sum + item.totals.definitions, 0),
    totalUsages,
    totalCallers,
    truncated: usageResults.some((r) => r.usages.length >= 25 || r.callers.length >= 25),
    suggestedNextTools,
  });
}

async function findSymbolCallers(
  client: ReturnType<typeof createCodeMapClient>,
  symbolName: string,
  filePath: string | undefined,
  projectId?: string,
) {
  const resolvedProjectId = projectId ?? (await readWorkspaceProjectId());
  if (!filePath) {
    return success("action=callers requires file_path.", {
      projectId: resolvedProjectId ?? null,
      symbolName,
      found: false,
      callers: [],
    });
  }
  if (!resolvedProjectId) {
    return success("No project ID provided and no linked project found.", {
      projectId: null,
      path: filePath,
      symbolName,
      found: false,
      callers: [],
    });
  }
  const result = await client.request<SymbolUsagesResponse>(
    `/projects/${encodeURIComponent(resolvedProjectId)}/map/symbol-usages`,
    { authRequired: true, query: { symbolName, path: filePath } },
  );
  const lines: string[] = [
    `Callers of '${symbolName}' in ${filePath}`,
    `Symbol exported: ${result.target.isExported ? "yes" : "no"}`,
    `Confidence data: ${result.meta.source}, ${result.meta.staleness}, parse=${result.meta.parseStatus ?? "unknown"}`,
    "",
  ];
  if (result.callers.length === 0) {
    lines.push(result.target.isExported ? "No callers found. Symbol may be unused, entry-like, or used outside parsed code." : "No callers found. Symbol is not exported and has no parsed external usages.");
  } else {
    lines.push(`Found ${result.callers.length} caller(s):`);
    for (const caller of result.callers.slice(0, 50)) {
      const names = caller.importedNames?.length ? ` { ${caller.importedNames.join(", ")} }` : "";
      const source = caller.moduleSpecifier !== undefined ? ` from '${caller.moduleSpecifier}'` : "";
      const snippet = caller.snippetPreview ? ` - ${caller.snippetPreview}` : "";
      lines.push(`  ${caller.filePath}:${formatUsageRange(caller.range)} [${caller.confidence}/${caller.evidence}${names}${source}]${snippet}`);
    }
  }
  return success(lines.join("\n"), {
    projectId: resolvedProjectId,
    path: filePath,
    symbolName,
    found: true,
    target: result.target,
    callers: result.callers,
    usages: result.usages,
    definitions: result.definitions,
    totalCallers: result.totals.callers,
    totalUsages: result.totals.usages,
    truncated: result.callers.length >= 50,
    meta: result.meta,
    suggestedNextTools: [
      `get_file("${filePath}", include=["symbols"], symbol_names=["${symbolName}"])`,
      result.callers.length > 5 ? `move_symbols(from="${filePath}", to="<destination>", symbols=["${symbolName}"])  // refactor to different module` : undefined,
      "diff()  // after making changes",
    ].filter(Boolean) as string[],
  });
}

async function findSimilarSymbols(
  client: ReturnType<typeof createCodeMapClient>,
  symbolName: string,
  filePath?: string,
  projectId?: string,
  limit = 5,
) {
  const resolvedProjectId = projectId ?? (await readWorkspaceProjectId());
  const cappedLimit = Math.max(1, Math.min(20, limit));

  async function localResponse(reason?: string) {
    const { store, summary: localIndex } = await ensureLocalIndexWithSummary();
    const search = store.search(symbolName, null);
    const selectedSymbol = chooseSymbol(search.symbols, symbolName, filePath);
    const candidates = search.symbols
      .filter(
        (symbol) =>
          symbol.id !== selectedSymbol?.id &&
          symbol.displayName.toLowerCase() !== symbolName.toLowerCase(),
      )
      .slice(0, cappedLimit);

    const lines = [`# Similar symbols: ${symbolName}`, ""];
    if (candidates.length === 0) {
      lines.push("No similar symbols found in the local keyword index.");
    } else {
      lines.push("Local keyword matches:");
      for (const [index, symbol] of candidates.entries()) {
        const loc = symbol.startLine ? `${symbol.filePath}:${symbol.startLine}` : symbol.filePath;
        lines.push(`${index + 1}. ${symbol.displayName} [${symbol.symbolKind}] — ${loc}`);
        if (symbol.signature) lines.push(`   ${symbol.signature}`);
      }
    }

    return success(lines.join("\n"), {
      projectId: resolvedProjectId,
      source: "local",
      localIndex,
      symbolName,
      filePath: filePath ?? null,
      found: candidates.length > 0,
      selectedSymbol,
      similar: candidates,
      semanticUnavailable: true,
      ...(reason ? { errors: [`remote: ${reason}`] } : {}),
    });
  }

  if (!resolvedProjectId) return localResponse("missing_project_id");

  if (await shouldUseLocalIndexBeforeRemote(client, resolvedProjectId)) {
    return localResponse("remote_index_not_ready_or_stale");
  }

  try {
    const search = await client.request<CodebaseSearchResponse>(
      `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
      { authRequired: true, query: { q: symbolName } },
    );
    const selectedSymbol = chooseSymbol(search.symbols, symbolName, filePath);
    const query = selectedSymbol?.signature
      ? `${selectedSymbol.displayName} ${selectedSymbol.symbolKind} ${selectedSymbol.signature}`
      : selectedSymbol
        ? `${selectedSymbol.displayName} ${selectedSymbol.symbolKind}`
        : symbolName;

    const semanticResponse = await client.request<{ results: SemanticSearchResult[] }>(
      `/projects/${encodeURIComponent(resolvedProjectId)}/map/search/semantic`,
      { authRequired: true, query: { q: query, limit: String(cappedLimit + 3) } },
    );

    const similar = (semanticResponse.results ?? [])
      .filter(
        (result) =>
          result.path !== selectedSymbol?.filePath ||
          (result.symbolName && result.symbolName !== selectedSymbol?.displayName),
      )
      .slice(0, cappedLimit);

    const lines = [`# Similar symbols: ${symbolName}`, ""];
    if (selectedSymbol) {
      const loc = selectedSymbol.startLine
        ? `${selectedSymbol.filePath}:${selectedSymbol.startLine}`
        : selectedSymbol.filePath;
      lines.push(`Anchor: ${selectedSymbol.displayName} [${selectedSymbol.symbolKind}] — ${loc}`);
      lines.push("");
    }

    if (similar.length === 0) {
      lines.push("No semantic matches found.");
    } else {
      lines.push("Semantic matches:");
      for (const [index, result] of similar.entries()) {
        const name = result.symbolName ? `${result.symbolName} ` : "";
        const loc = result.startLine ? `${result.path}:${result.startLine}` : result.path;
        lines.push(`${index + 1}. ${name}[${result.chunkType}] — ${loc} (score ${result.score.toFixed(3)})`);
        if (result.snippet) lines.push(`   ${result.snippet.replace(/\s+/g, " ").slice(0, 180)}`);
      }
    }

    return success(lines.join("\n"), {
      projectId: resolvedProjectId,
      source: "remote",
      symbolName,
      filePath: filePath ?? null,
      found: similar.length > 0,
      selectedSymbol,
      query,
      similar,
      suggestedNextTools: similar.slice(0, 3).map((result) =>
        result.symbolName
          ? `get_file("${result.path}", include=["symbols"], symbol_names=["${result.symbolName}"])`
          : `get_file("${result.path}", include=["outline"])`,
      ),
    });
  } catch (error) {
    if (shouldFallbackToLocal(error)) {
      return localResponse(error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
}

export function registerSymbolTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "symbol",
    {
      title: "Symbol",
      description:
        "Inspect a symbol. Default action=context reads one symbol body plus compact surrounding outline. " +
        "Use action=usages to find definitions/usages/callers by symbol name, action=callers with file_path for faster cross-file callers, or action=similar for semantic matches. " +
        "project_id is optional if workspace is linked.\n\n" +
        "USE WHEN: debugging a specific function/class, checking who calls a symbol before refactoring, " +
        "finding the definition of an unknown symbol, or understanding the impact of changing a symbol.",
      inputSchema: {
        action: z.enum(["context", "usages", "callers", "similar"]).optional().default("context").describe("Symbol action to perform."),
        symbol_name: z
          .string()
          .min(1)
          .describe("Symbol name to inspect, e.g. BillingSection or createBillingService."),
        file_path: z
          .string()
          .optional()
          .describe("Optional file path to disambiguate the symbol. Required for action=callers."),
        project_id: uuidSchema
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
        context_lines: z
          .number()
          .int()
          .min(0)
          .max(30)
          .optional()
          .default(4)
          .describe("Extra lines before and after the symbol body. Default: 4."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .default(5)
          .describe("Max results for action=similar. Default: 5."),
      },
    },
    withToolError(async ({ action, symbol_name, file_path, project_id, context_lines, limit }) => {
      if (action === "usages") return findSymbolUsages(client, symbol_name, project_id);
      if (action === "callers") return findSymbolCallers(client, symbol_name, file_path, project_id);
      if (action === "similar") return findSimilarSymbols(client, symbol_name, file_path, project_id, limit);
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      async function localResponse(projectId: string | null, reason?: string) {
        const { store, summary: localIndex } = await ensureLocalIndexWithSummary();
        const search = store.search(symbol_name, null);
        const symbol = chooseSymbol(search.symbols, symbol_name, file_path);

        if (!symbol) {
          return success(`Symbol not found in local index: ${symbol_name}`, {
            projectId,
            source: "local",
            localIndex,
            symbolName: symbol_name,
            filePath: file_path ?? null,
            found: false,
            candidates: search.symbols.slice(0, 10),
            ...(reason ? { errors: [`remote: ${reason}`] } : {}),
          });
        }

        const startLine = symbol.startLine
          ? Math.max(1, symbol.startLine - (context_lines ?? 4))
          : undefined;
        const endLine = symbol.endLine
          ? symbol.endLine + (context_lines ?? 4)
          : symbol.startLine
            ? symbol.startLine + 80
            : undefined;
        const content = store.getFileContent(symbol.filePath, startLine, endLine);
        const parse = store.getFileParse(symbol.filePath);

        return success(
          buildOutput({
            symbolName: symbol_name,
            symbol,
            content,
            parse,
            range: {
              startLine: startLine ?? null,
              endLine: endLine ?? null,
            },
          }),
          {
            projectId,
            source: "local",
            localIndex,
            symbolName: symbol_name,
            filePath: symbol.filePath,
            found: true,
            selectedSymbol: symbol,
            range: {
              startLine: startLine ?? null,
              endLine: endLine ?? null,
            },
            content,
            outline: parse,
            suggestedNextTools: [
              formatSymbolCall(symbol),
              `get_file("${symbol.filePath}", include=["outline"])`,
            ],
            ...(reason ? { errors: [`remote: ${reason}`] } : {}),
          },
        );
      }

      if (!resolvedProjectId) return localResponse(null, "missing_project_id");

      if (await shouldUseLocalIndexBeforeRemote(client, resolvedProjectId)) {
        return localResponse(resolvedProjectId, "remote_index_not_ready_or_stale");
      }

      let search: CodebaseSearchResponse;
      try {
        search = await client.request<CodebaseSearchResponse>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
          {
            authRequired: true,
            query: { q: symbol_name },
          },
        );
      } catch (error) {
        if (shouldFallbackToLocal(error)) {
          return localResponse(
            resolvedProjectId,
            error instanceof Error ? error.message : String(error),
          );
        }
        throw error;
      }
      const symbol = chooseSymbol(search.symbols, symbol_name, file_path);

      if (!symbol) {
        return success(`Symbol not found: ${symbol_name}`, {
          projectId: resolvedProjectId,
          source: "remote",
          symbolName: symbol_name,
          filePath: file_path ?? null,
          found: false,
          candidates: search.symbols.slice(0, 10),
        });
      }

      const startLine = symbol.startLine
        ? Math.max(1, symbol.startLine - (context_lines ?? 4))
        : undefined;
      const endLine = symbol.endLine
        ? symbol.endLine + (context_lines ?? 4)
        : symbol.startLine
          ? symbol.startLine + 80
          : undefined;

      const [contentResult, parseResult] = await Promise.allSettled([
        client.request<FileContent>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/map/files/content`,
          {
            authRequired: true,
            query: {
              path: symbol.filePath,
              ...(startLine !== undefined && { startLine: String(startLine) }),
              ...(endLine !== undefined && { endLine: String(endLine) }),
            },
          },
        ),
        client.request<FileParseResponse>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/map/files/parse`,
          { authRequired: true, query: { path: symbol.filePath } },
        ),
      ]);

      const content =
        contentResult.status === "fulfilled" ? contentResult.value : null;
      const parse = parseResult.status === "fulfilled" ? parseResult.value : null;

      // Cloud returned "ready" but null content — stale index, use local.
      if (isCloudContentEmpty(content)) {
        return localResponse(resolvedProjectId, "cloud_content_unavailable");
      }

      if (!content && !parse) {
        const remoteError =
          contentResult.status === "rejected"
            ? contentResult.reason
            : parseResult.status === "rejected"
              ? parseResult.reason
              : null;
        if (shouldFallbackToLocal(remoteError)) {
          return localResponse(
            resolvedProjectId,
            remoteError instanceof Error ? remoteError.message : String(remoteError),
          );
        }
      }

      return success(
        buildOutput({
          symbolName: symbol_name,
          symbol,
          content,
          parse,
          range: {
            startLine: startLine ?? null,
            endLine: endLine ?? null,
          },
        }),
        {
          projectId: resolvedProjectId,
          source: "remote",
          symbolName: symbol_name,
          filePath: symbol.filePath,
          found: true,
          selectedSymbol: symbol,
          range: {
            startLine: startLine ?? null,
            endLine: endLine ?? null,
          },
          content,
          outline: parse,
          suggestedNextTools: [
            formatSymbolCall(symbol),
            `symbol(action="usages", symbol_name="${symbol.displayName}")`,
            `get_file("${symbol.filePath}", include=["outline"])`,
          ],
        },
      );
    }),
  );
}
