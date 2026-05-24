import { z } from "zod";
import { uuidSchema } from "../lib/uuid-schema.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type {
  CodebaseSearchResponse,
  FileContent,
  SearchSymbolResult,
} from "../lib/api-types.js";
import {
  ensureLocalIndexWithSummary,
  shouldFallbackToLocal,
  shouldUseLocalIndexBeforeRemote,
} from "../lib/local-index.js";

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
    lines.push("```");
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
  lines.push(`- find_usages("${symbol.displayName}")  // callers and references`);
  lines.push(`- get_file("${symbol.filePath}", include=["outline"])  // full file outline only`);

  return lines.join("\n");
}

export function registerGetSymbolContextTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "get_symbol_context",
    {
      title: "Get Symbol Context",
      description:
        "Read one symbol body plus compact surrounding outline. " +
        "Use this after search_codebase, summarize_feature_area, or find_related_files when a function/component/class is the real target. " +
        "This avoids reading an entire file just to inspect one symbol. " +
        "project_id is optional if workspace is linked.",
      inputSchema: {
        symbol_name: z
          .string()
          .min(1)
          .describe("Symbol name to inspect, e.g. BillingSection or createBillingService."),
        file_path: z
          .string()
          .optional()
          .describe("Optional file path to disambiguate the symbol."),
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
      },
    },
    withToolError(async ({ symbol_name, file_path, project_id, context_lines }) => {
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
            `find_usages("${symbol.displayName}")`,
            `get_file("${symbol.filePath}", include=["outline"])`,
          ],
        },
      );
    }),
  );
}
