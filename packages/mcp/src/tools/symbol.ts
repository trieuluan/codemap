import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { success, withToolError } from "@codemap-ai/core/lib/tool-response.js";
import type {
  FileContent,
  SearchSymbolResult,
} from "@codemap-ai/core/lib/api-types.js";
import { ensureLocalIndexWithSummary } from "@codemap-ai/core/lib/local-index.js";
import { markdownFenceStart } from "@codemap-ai/core/lib/markdown-fence.js";

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

async function scanImporterCallersFallback(
  store: Awaited<ReturnType<typeof ensureLocalIndexWithSummary>>["store"],
  symbolName: string,
  targetFiles: string[],
) {
  const callers: Array<{ filePath: string; calleeName: string; line: number; preview: string }> = [];
  const seenFiles = new Set<string>();
  const needle = new RegExp(`\\b${symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  for (const tf of targetFiles) {
    if (seenFiles.has(tf)) continue;
    seenFiles.add(tf);
    const parse = store.getFileParse(tf);
    for (const ib of parse?.importedBy ?? []) {
      const content = store.getFileContent(ib.sourceFilePath)?.content;
      if (!content) continue;
      const fileLines = content.split(/\r?\n/);
      for (let i = 0; i < fileLines.length; i++) {
        if (needle.test(fileLines[i]!)) {
          callers.push({
            filePath: ib.sourceFilePath,
            calleeName: symbolName,
            line: i + 1,
            preview: fileLines[i]!.trim().slice(0, 120),
          });
          if (callers.length >= 30) return callers;
        }
      }
    }
  }
  return callers;
}

async function findSymbolUsagesLocal(symbolName: string) {
  const { store } = await ensureLocalIndexWithSummary();
  const search = store.search(symbolName, null);
  const definitions = search.symbols.filter((s) => s.displayName === symbolName);
  const targets = definitions.length > 0 ? definitions : search.symbols.slice(0, 5);

  const astCallers = store.findSymbolCallers(symbolName);
  const callers =
    astCallers.length > 0
      ? astCallers
      : await scanImporterCallersFallback(
          store,
          symbolName,
          targets.map((d) => d.filePath),
        );
  const hierarchy = store.findSymbolRelationships(symbolName);

  const out: string[] = [
    `Symbol usages (local): ${symbolName}`,
    `Definitions (${targets.length}):`,
    ...targets.slice(0, 10).map((d) => `  ${d.filePath}:${d.startLine ?? "?"} [${d.symbolKind}] ${d.displayName}`),
    `Callers (${callers.length}):`,
    ...callers.slice(0, 25).map((c) => `  ${c.filePath}:${c.line} -> ${c.calleeName}${c.preview ? ` | ${c.preview}` : ""}`),
    ...(hierarchy.children.length > 0
      ? [
          `Implementers / Subclasses (${hierarchy.children.length}):`,
          ...hierarchy.children.slice(0, 15).map((r) => `  ${r.filePath}: ${r.fromSymbolLocalKey.split(":").pop()} (${r.relationshipKind} ${r.toSymbolName})`),
        ]
      : []),
  ];

  return success(out.join("\n"), {
    symbolName,
    source: "local",
    found: targets.length > 0 || callers.length > 0 || hierarchy.byFile.length > 0,
    definitions: targets,
    callers,
    hierarchy,
  });
}

async function findSymbolCallersLocal(symbolName: string, filePath?: string) {
  const { store } = await ensureLocalIndexWithSummary();
  if (!filePath) return findSymbolUsagesLocal(symbolName);

  const astCallers = store.findSymbolCallers(symbolName, filePath);
  const callers =
    astCallers.length > 0
      ? astCallers
      : await scanImporterCallersFallback(store, symbolName, [filePath]);

  const out = [
    `Callers of ${symbolName} (${filePath}): ${callers.length}`,
    ...callers.slice(0, 25).map((c) => `  ${c.filePath}:${c.line} -> ${c.calleeName}${c.preview ? ` | ${c.preview}` : ""}`),
  ];
  return success(out.join("\n"), {
    symbolName,
    filePath,
    source: "local",
    callers,
  });
}

async function findSymbolHierarchyLocal(symbolName: string) {
  const { store } = await ensureLocalIndexWithSummary();
  const hierarchy = store.findSymbolRelationships(symbolName);
  const out = [
    `Symbol hierarchy for ${symbolName}:`,
    `Extends / Implements (${hierarchy.parents.length}):`,
    ...hierarchy.parents.map((p) => `  ${p.filePath}: ${p.relationshipKind} ${p.toSymbolName}`),
    `Implementers / Subclasses (${hierarchy.children.length}):`,
    ...hierarchy.children.map((c) => `  ${c.filePath}: ${c.fromSymbolLocalKey.split(":").pop()} (${c.relationshipKind} ${c.toSymbolName})`),
  ];
  return success(out.join("\n"), {
    symbolName,
    source: "local",
    ...hierarchy,
  });
}

async function findSimilarSymbolsLocal(symbolName: string, limit: number) {
  const { store } = await ensureLocalIndexWithSummary();
  const search = store.search(symbolName, null);
  const matches = search.symbols.slice(0, limit);
  const out = [
    `Similar symbols for "${symbolName}" (${matches.length}):`,
    ...matches.map((m) => `  ${m.filePath}:${m.startLine ?? "?"} [${m.symbolKind}] ${m.displayName}`),
  ];
  return success(out.join("\n"), {
    symbolName,
    source: "local",
    matches,
  });
}

export function registerSymbolTool(server: McpServer) {
  server.registerTool(
    "symbol",
    {
      title: "Symbol",
      description:
        "Inspect a symbol from the local SQLite index. Default action=context reads one symbol body plus surrounding outline. " +
        "Use action=usages or action=callers for AST call-graph callers, action=hierarchy for extends/implements relationships, or action=similar for name matches.",
      inputSchema: {
        action: z.enum(["context", "usages", "callers", "hierarchy", "similar"]).optional().default("context").describe("Symbol action to perform."),
        symbol_name: z
          .string()
          .min(1)
          .describe("Symbol name to inspect."),
        file_path: z
          .string()
          .optional()
          .describe("Optional file path to disambiguate the symbol."),
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
    withToolError(async ({ action, symbol_name, file_path, context_lines, limit }) => {
      if (action === "usages") return findSymbolUsagesLocal(symbol_name);
      if (action === "callers") return findSymbolCallersLocal(symbol_name, file_path);
      if (action === "hierarchy") return findSymbolHierarchyLocal(symbol_name);
      if (action === "similar") return findSimilarSymbolsLocal(symbol_name, limit);

      const { store, summary: localIndex } = await ensureLocalIndexWithSummary();
      const search = store.search(symbol_name, null);
      const symbol = chooseSymbol(search.symbols, symbol_name, file_path);

      if (!symbol) {
        return success(`Symbol not found in local index: ${symbol_name}`, {
          source: "local",
          localIndex,
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
        },
      );
    }),
  );
}
