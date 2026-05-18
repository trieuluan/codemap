import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type EmbeddingChunkType = "file" | "symbol" | "doc" | "test" | "route" | "config";

export interface EmbeddingChunk {
  chunkKey: string;
  projectId: string;
  fileId?: string | null;
  path: string;
  symbolId?: string | null;
  symbolName?: string;
  symbolKind?: string;
  chunkType: EmbeddingChunkType;
  language?: string | null;
  content: string;
  contentHash: string;
  startLine?: number | null;
  endLine?: number | null;
  metadata?: Record<string, unknown>;
}

const SYMBOL_KINDS = new Set(["function", "class", "interface", "component", "method", "type_alias"]);
const MAX_CHARS = 24_000;

export function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function estimateTokens(value: string) {
  return Math.ceil(value.length / 4);
}

export function shouldSkipEmbeddingPath(path: string) {
  if (/(^|\/)(node_modules|dist|build|\.next|coverage|\.git)(\/|$)/.test(path)) return true;
  if (/(^|\/)(package-lock|pnpm-lock|yarn\.lock|bun\.lockb)$/.test(path)) return true;
  if (/\.(min\.(js|css)|map|png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|wasm)$/i.test(path)) return true;
  return false;
}

export async function buildEmbeddingChunks(params: {
  projectId: string;
  workspacePath: string;
  files: Array<{ id: string; path: string; language: string | null; isText: boolean; isGenerated: boolean; isIgnored: boolean; lineCount: number | null }>;
  symbols: Array<{ id: string; fileId: string | null; displayName: string; kind: string; language: string | null; signature: string | null; startLine?: number | null; endLine?: number | null }>;
}) {
  const symbolsByFile = new Map<string, typeof params.symbols>();
  for (const symbol of params.symbols) {
    if (!symbol.fileId || !SYMBOL_KINDS.has(symbol.kind)) continue;
    const list = symbolsByFile.get(symbol.fileId) ?? [];
    list.push(symbol);
    symbolsByFile.set(symbol.fileId, list);
  }

  const chunks: EmbeddingChunk[] = [];
  for (const file of params.files) {
    if (!file.isText || file.isGenerated || file.isIgnored || shouldSkipEmbeddingPath(file.path)) continue;
    const source = await readFile(join(params.workspacePath, file.path), "utf8").catch(() => null);
    if (!source) continue;
    const lines = source.split(/\r?\n/);
    const symbols = symbolsByFile.get(file.id) ?? [];

    for (const symbol of symbols) {
      const startLine = symbol.startLine ?? 1;
      const endLine = symbol.endLine ?? startLine;
      const body = lines.slice(Math.max(0, startLine - 1), Math.min(lines.length, endLine)).join("\n");
      if (!body.trim()) continue;
      chunks.push(makeChunk({
        projectId: params.projectId,
        fileId: file.id,
        path: file.path,
        symbolId: symbol.id,
        symbolName: symbol.displayName,
        symbolKind: symbol.kind,
        chunkType: inferChunkType(file.path, symbol.kind),
        language: symbol.language ?? file.language,
        startLine,
        endLine,
        content: formatChunk(file.path, symbol.language ?? file.language, symbol.displayName, symbol.kind, startLine, endLine, body),
      }));
    }

    if (symbols.length === 0 || source.length < 12_000 || /\.(md|mdx|json|ya?ml|toml)$/i.test(file.path)) {
      chunks.push(makeChunk({
        projectId: params.projectId,
        fileId: file.id,
        path: file.path,
        chunkType: inferChunkType(file.path),
        language: file.language,
        startLine: 1,
        endLine: lines.length,
        content: formatChunk(file.path, file.language, undefined, undefined, 1, lines.length, source),
      }));
    }
  }
  return chunks;
}

function makeChunk(input: Omit<EmbeddingChunk, "chunkKey" | "contentHash">): EmbeddingChunk {
  const content = input.content.length > MAX_CHARS ? input.content.slice(0, MAX_CHARS) : input.content;
  const identity = `${input.projectId}:${input.path}:${input.symbolName ?? ""}:${input.startLine ?? ""}:${input.endLine ?? ""}:${input.chunkType}`;
  return { ...input, content, chunkKey: hashText(identity), contentHash: hashText(content) };
}

function formatChunk(path: string, language: string | null | undefined, symbol: string | undefined, kind: string | undefined, startLine: number, endLine: number, source: string) {
  return [`path: ${path}`, `language: ${language ?? "unknown"}`, symbol ? `symbol: ${symbol}` : null, kind ? `kind: ${kind}` : null, `lines: ${startLine}-${endLine}`, "", source].filter(Boolean).join("\n");
}

function inferChunkType(path: string, kind?: string): EmbeddingChunkType {
  if (/\.test\.|\.spec\.|(__tests__|test|tests)\//.test(path)) return "test";
  if (/\.(md|mdx)$/i.test(path)) return "doc";
  if (/(route|router|page)\./i.test(path)) return "route";
  if (/\.(json|ya?ml|toml|config\.[jt]s)$/i.test(path)) return "config";
  if (kind) return "symbol";
  return "file";
}
