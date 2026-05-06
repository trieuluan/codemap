import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  collectWorkspaceFiles,
  loadTypeScriptResolverConfigs,
  parseWorkspaceFileSemantics,
  PARSE_TOOL_NAME,
  PARSE_TOOL_VERSION,
  type ParsedExportDraft,
  type ParsedImportDraft,
  type ParsedSymbolDraft,
  type WorkspaceFileCandidate,
} from "@codemap/code-index";
import { resolveWorkspace } from "./workspace-resolver.js";
import type {
  CodebaseSearchResponse,
  FileContent,
  SearchExportResult,
  SearchFileResult,
  SearchSymbolResult,
} from "./api-types.js";
import type { CodeMapClient } from "./codemap-api.js";
import { fetchLatestProjectImport } from "./import-health.js";

export interface LocalIndexSummary {
  workspaceRootPath: string;
  cachePath: string;
  indexedAt: string | null;
  fileCount: number;
  symbolCount: number;
  stale: boolean;
}

interface LocalFileManifestEntry {
  path: string;
  sizeBytes: number;
  contentSha256: string | null;
  parseStatus: string;
}

export interface LocalIndexedFile {
  path: string;
  dirPath: string;
  baseName: string;
  extension: string | null;
  language: string | null;
  mimeType: string | null;
  sizeBytes: number;
  lineCount: number | null;
  parseStatus: string;
  isBinary: boolean;
  isText: boolean;
  contentSha256: string | null;
  content: string | null;
  symbols: ParsedSymbolDraft[];
  imports: ParsedImportDraft[];
  importedBy: LocalImportedBy[];
  exports: ParsedExportDraft[];
}

export interface LocalImportedBy {
  sourceFilePath: string;
  moduleSpecifier: string;
  importKind: string;
  resolutionKind: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface LocalIndex {
  version: 1;
  parser: {
    name: string;
    version: string;
  };
  workspaceRootPath: string;
  cachePath: string;
  indexedAt: string;
  commitSha: string | null;
  files: LocalIndexedFile[];
  manifest: LocalFileManifestEntry[];
  stats: {
    totalFileCount: number;
    parsedFileCount: number;
    symbolCount: number;
    importCount: number;
    exportCount: number;
    errorFileCount: number;
  };
}

interface LocalFileParseResponse {
  file: {
    fileId: string | null;
    path: string;
    language: string | null;
    lineCount: number | null;
    parseStatus: string;
    sizeBytes: number | null;
    mimeType: string | null;
    extension: string | null;
    importParseStatus: string;
  };
  imports: Array<{
    id: string;
    moduleSpecifier: string;
    importKind: string;
    isResolved: boolean;
    resolutionKind: string;
    targetPathText: string | null;
    targetExternalSymbolKey: string | null;
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  }>;
  importedBy: LocalImportedBy[];
  exports: Array<{
    id: string;
    symbolId: string | null;
    exportName: string;
    exportKind: string;
    symbolDisplayName: string | null;
    sourceModuleSpecifier: string | null;
    symbolStartLine: number | null;
    symbolStartCol: number | null;
    symbolEndLine: number | null;
    symbolEndCol: number | null;
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  }>;
  symbols: Array<{
    id: string;
    displayName: string;
    kind: string;
    signature: string | null;
    returnType: string | null;
    doc: string | null;
    heritage: Array<{ kind: string; targetName: string }>;
    isExported: boolean;
    parentSymbolName: string | null;
    startLine: number | null;
    startCol: number | null;
    endLine: number | null;
    endCol: number | null;
  }>;
  blastRadius: {
    totalCount: number;
    directCount: number;
    maxDepth: number;
    hasCycles: boolean;
    files: Array<{
      path: string;
      language: string | null;
      depth: number;
      incomingCount: number;
      outgoingCount: number;
    }>;
  };
  cycles: [];
}

function localIndexCachePath(workspaceRootPath: string) {
  return path.join(workspaceRootPath, ".codemap", "local-index.json");
}

function buildManifest(files: WorkspaceFileCandidate[]): LocalFileManifestEntry[] {
  return files.map((file) => ({
    path: file.path,
    sizeBytes: file.sizeBytes,
    contentSha256: file.contentSha256,
    parseStatus: file.parseStatus,
  }));
}

function manifestMatches(
  left: LocalFileManifestEntry[],
  right: LocalFileManifestEntry[],
) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a.path !== b.path ||
      a.sizeBytes !== b.sizeBytes ||
      a.contentSha256 !== b.contentSha256 ||
      a.parseStatus !== b.parseStatus
    ) {
      return false;
    }
  }
  return true;
}

function stableId(...parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => String(part ?? ""))
    .join(":")
    .replace(/[^a-zA-Z0-9:_./#-]/g, "_");
}

function toLocalFile(
  file: WorkspaceFileCandidate,
  semantics: Awaited<ReturnType<typeof parseWorkspaceFileSemantics>>,
): LocalIndexedFile {
  return {
    path: file.path,
    dirPath: file.dirPath,
    baseName: file.baseName,
    extension: file.extension,
    language: file.language,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    lineCount: file.lineCount,
    parseStatus: file.parseStatus,
    isBinary: file.isBinary,
    isText: file.isText,
    contentSha256: file.contentSha256,
    content: file.content,
    symbols: semantics.symbols,
    imports: semantics.imports,
    importedBy: [],
    exports: semantics.exports,
  };
}

function attachIncomingImports(files: LocalIndexedFile[]) {
  const byPath = new Map(files.map((file) => [file.path, file]));
  for (const file of files) {
    for (const imp of file.imports) {
      if (!imp.targetPathText) continue;
      const target = byPath.get(imp.targetPathText);
      if (!target) continue;
      target.importedBy.push({
        sourceFilePath: file.path,
        moduleSpecifier: imp.moduleSpecifier,
        importKind: imp.importKind,
        resolutionKind: imp.resolutionKind,
        startLine: imp.line,
        startCol: imp.col,
        endLine: imp.endLine,
        endCol: imp.endCol,
      });
    }
  }
}

export async function readLocalIndex(workspaceRootPath?: string) {
  const workspace = workspaceRootPath
    ? { workspaceRootPath }
    : await resolveWorkspace();
  const cachePath = localIndexCachePath(workspace.workspaceRootPath);
  try {
    const raw = await readFile(cachePath, "utf8");
    return JSON.parse(raw) as LocalIndex;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

export async function buildLocalIndex(input?: {
  workspaceRootPath?: string;
}): Promise<LocalIndex> {
  const resolved = input?.workspaceRootPath
    ? {
        workspaceRootPath: input.workspaceRootPath,
        workspace: await resolveWorkspace({ cwd: input.workspaceRootPath }).then(
          (workspace) => workspace.workspace,
        ),
      }
    : await resolveWorkspace();
  const workspaceRootPath = resolved.workspaceRootPath;
  const cachePath = localIndexCachePath(workspaceRootPath);
  const files = await collectWorkspaceFiles(workspaceRootPath);
  const filePathSet = new Set(files.map((file) => file.path));
  const resolverConfigs = await loadTypeScriptResolverConfigs(workspaceRootPath);

  const indexedFiles: LocalIndexedFile[] = [];
  for (const file of files) {
    const semantics = await parseWorkspaceFileSemantics({
      file,
      filePathSet,
      projectImportId: "local",
      workspacePath: workspaceRootPath,
      resolverConfigs,
    });
    indexedFiles.push(toLocalFile(file, semantics));
  }
  attachIncomingImports(indexedFiles);

  const index: LocalIndex = {
    version: 1,
    parser: {
      name: PARSE_TOOL_NAME,
      version: PARSE_TOOL_VERSION,
    },
    workspaceRootPath,
    cachePath,
    indexedAt: new Date().toISOString(),
    commitSha: resolved.workspace?.commitSha ?? null,
    files: indexedFiles,
    manifest: buildManifest(files),
    stats: {
      totalFileCount: indexedFiles.length,
      parsedFileCount: indexedFiles.filter((file) => file.parseStatus === "parsed").length,
      symbolCount: indexedFiles.reduce((sum, file) => sum + file.symbols.length, 0),
      importCount: indexedFiles.reduce((sum, file) => sum + file.imports.length, 0),
      exportCount: indexedFiles.reduce((sum, file) => sum + file.exports.length, 0),
      errorFileCount: indexedFiles.filter((file) => file.parseStatus === "error").length,
    },
  };

  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return index;
}

export async function isLocalIndexStale(index: LocalIndex) {
  const files = await collectWorkspaceFiles(index.workspaceRootPath);
  return !manifestMatches(index.manifest, buildManifest(files));
}

export async function ensureLocalIndex(input?: {
  force?: boolean;
  workspaceRootPath?: string;
}) {
  if (input?.force) return buildLocalIndex(input);

  const existing = await readLocalIndex(input?.workspaceRootPath);
  if (existing && !(await isLocalIndexStale(existing))) {
    return existing;
  }

  return buildLocalIndex(input);
}

export async function getLocalIndexSummary(index: LocalIndex): Promise<LocalIndexSummary> {
  return {
    workspaceRootPath: index.workspaceRootPath,
    cachePath: index.cachePath,
    indexedAt: index.indexedAt,
    fileCount: index.files.length,
    symbolCount: index.stats.symbolCount,
    stale: await isLocalIndexStale(index),
  };
}

export function shouldFallbackToLocal(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Not authenticated") ||
    message.includes("Failed to reach CodeMap API") ||
    message.includes("CodeMap API returned 401") ||
    message.includes("CodeMap API returned 403") ||
    message.includes("CodeMap API returned 404") ||
    message.includes("CodeMap API returned 409") ||
    message.includes("CodeMap API returned 422") ||
    message.includes("Unexpected response from API")
  );
}

export async function shouldUseLocalIndexBeforeRemote(
  client: CodeMapClient,
  projectId: string,
) {
  try {
    const [latestImport, workspace] = await Promise.all([
      fetchLatestProjectImport(client, projectId),
      resolveWorkspace(),
    ]);

    if (!latestImport) return true;
    if (latestImport.status !== "completed" || latestImport.parseStatus !== "completed") {
      return true;
    }
    if (
      latestImport.commitSha &&
      workspace.workspace?.commitSha &&
      latestImport.commitSha !== workspace.workspace.commitSha
    ) {
      return true;
    }
    return false;
  } catch (error) {
    return shouldFallbackToLocal(error);
  }
}

function terms(query: string) {
  return query
    .toLowerCase()
    .split(/[\s\-_/.,:]+/)
    .map((term) => term.replace(/[^a-z0-9]/g, ""))
    .filter((term) => term.length > 1);
}

function includesAll(input: string, queryTerms: string[]) {
  const lower = input.toLowerCase();
  return queryTerms.every((term) => lower.includes(term));
}

function scoreText(input: string, queryTerms: string[], baseRank: number) {
  const lower = input.toLowerCase();
  let score = 100 - baseRank;
  for (const term of queryTerms) {
    if (lower === term) score += 30;
    else if (lower.includes(term)) score += 12;
  }
  return score;
}

export function searchLocalIndex(input: {
  index: LocalIndex;
  query: string;
  symbolKinds?: string[] | null;
}): CodebaseSearchResponse {
  const queryTerms = terms(input.query);
  const symbolKindSet = new Set(input.symbolKinds ?? []);

  const files: SearchFileResult[] = input.index.files
    .filter((file) => includesAll(file.path, queryTerms))
    .sort((a, b) => scoreText(b.path, queryTerms, 0) - scoreText(a.path, queryTerms, 0))
    .slice(0, 25)
    .map((file) => ({
      kind: "file",
      path: file.path,
      language: file.language,
    }));

  const symbols: SearchSymbolResult[] = input.index.files
    .flatMap((file) =>
      file.symbols.map((symbol) => ({
        file,
        symbol,
      })),
    )
    .filter(({ symbol }) => symbolKindSet.size === 0 || symbolKindSet.has(symbol.kind))
    .filter(({ file, symbol }) =>
      includesAll(`${symbol.displayName} ${symbol.signature ?? ""} ${file.path}`, queryTerms),
    )
    .sort(
      (a, b) =>
        scoreText(`${b.symbol.displayName} ${b.file.path}`, queryTerms, 0) -
        scoreText(`${a.symbol.displayName} ${a.file.path}`, queryTerms, 0),
    )
    .slice(0, 25)
    .map(({ file, symbol }) => ({
      kind: "symbol",
      id: stableId(file.path, symbol.stableKey),
      displayName: symbol.displayName,
      symbolKind: symbol.kind,
      signature: symbol.signature,
      filePath: file.path,
      parentSymbolName: symbol.parentSymbolLocalKey
        ? file.symbols.find((candidate) => candidate.localKey === symbol.parentSymbolLocalKey)
            ?.displayName ?? null
        : null,
      startLine: symbol.line,
      startCol: symbol.col,
      endLine: symbol.endLine,
      endCol: symbol.endCol,
    }));

  const exports: SearchExportResult[] = input.index.files
    .flatMap((file) =>
      file.exports.map((exp) => {
        const symbol = exp.symbolLocalKey
          ? file.symbols.find((candidate) => candidate.localKey === exp.symbolLocalKey) ?? null
          : null;
        return { file, exp, symbol };
      }),
    )
    .filter(({ file, exp, symbol }) =>
      includesAll(`${exp.exportName} ${symbol?.displayName ?? ""} ${file.path}`, queryTerms),
    )
    .sort(
      (a, b) =>
        scoreText(`${b.exp.exportName} ${b.file.path}`, queryTerms, 0) -
        scoreText(`${a.exp.exportName} ${a.file.path}`, queryTerms, 0),
    )
    .slice(0, 25)
    .map(({ file, exp, symbol }) => ({
      kind: "export",
      id: stableId(file.path, "export", exp.exportName, exp.line, exp.col),
      exportName: exp.exportName,
      filePath: file.path,
      symbolId: symbol ? stableId(file.path, symbol.stableKey) : null,
      symbolStartLine: symbol?.line ?? null,
      symbolStartCol: symbol?.col ?? null,
      symbolEndLine: symbol?.endLine ?? null,
      symbolEndCol: symbol?.endCol ?? null,
      startLine: exp.line,
      startCol: exp.col,
      endLine: exp.endLine,
      endCol: exp.endCol,
    }));

  return { files, symbols, exports };
}

function contentStatus(file: LocalIndexedFile): FileContent["status"] {
  if (file.content != null) return "ready";
  if (file.isBinary) return "binary";
  if (file.parseStatus === "too_large") return "too_large";
  if (file.parseStatus === "unsupported") return "unsupported";
  return "unavailable";
}

export function getLocalFileContent(input: {
  index: LocalIndex;
  filePath: string;
  startLine?: number;
  endLine?: number;
}): FileContent | null {
  const file = input.index.files.find((candidate) => candidate.path === input.filePath);
  if (!file) return null;

  let content = file.content;
  if (content && (input.startLine !== undefined || input.endLine !== undefined)) {
    const lines = content.split("\n");
    const start = Math.max(1, input.startLine ?? 1);
    const end = Math.min(lines.length, input.endLine ?? lines.length);
    content = lines.slice(start - 1, end).join("\n");
  }

  return {
    path: file.path,
    name: file.baseName,
    type: "file",
    extension: file.extension,
    language: file.language,
    kind: file.isBinary ? "binary" : "text",
    mimeType: file.mimeType,
    status: contentStatus(file),
    content,
    sizeBytes: file.sizeBytes,
    reason: content ? null : file.parseStatus,
  };
}

export function getLocalFileParse(input: {
  index: LocalIndex;
  filePath: string;
}): LocalFileParseResponse | null {
  const file = input.index.files.find((candidate) => candidate.path === input.filePath);
  if (!file) return null;

  const outgoingCount = (targetPath: string) =>
    input.index.files.find((candidate) => candidate.path === targetPath)?.imports.length ?? 0;

  return {
    file: {
      fileId: stableId(file.path),
      path: file.path,
      language: file.language,
      lineCount: file.lineCount,
      parseStatus: file.parseStatus,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
      extension: file.extension,
      importParseStatus: "completed",
    },
    imports: file.imports.map((imp) => ({
      id: stableId(file.path, "import", imp.localKey),
      moduleSpecifier: imp.moduleSpecifier,
      importKind: imp.importKind,
      isResolved: Boolean(imp.targetPathText),
      resolutionKind: imp.resolutionKind,
      targetPathText: imp.targetPathText,
      targetExternalSymbolKey: imp.targetExternalSymbolKey,
      startLine: imp.line,
      startCol: imp.col,
      endLine: imp.endLine,
      endCol: imp.endCol,
    })),
    importedBy: file.importedBy,
    exports: file.exports.map((exp) => {
      const symbol = exp.symbolLocalKey
        ? file.symbols.find((candidate) => candidate.localKey === exp.symbolLocalKey) ?? null
        : null;
      return {
        id: stableId(file.path, "export", exp.exportName, exp.line, exp.col),
        symbolId: symbol ? stableId(file.path, symbol.stableKey) : null,
        exportName: exp.exportName,
        exportKind: exp.exportKind,
        symbolDisplayName: symbol?.displayName ?? null,
        sourceModuleSpecifier: null,
        symbolStartLine: symbol?.line ?? null,
        symbolStartCol: symbol?.col ?? null,
        symbolEndLine: symbol?.endLine ?? null,
        symbolEndCol: symbol?.endCol ?? null,
        startLine: exp.line,
        startCol: exp.col,
        endLine: exp.endLine,
        endCol: exp.endCol,
      };
    }),
    symbols: file.symbols.map((symbol) => ({
      id: stableId(file.path, symbol.stableKey),
      displayName: symbol.displayName,
      kind: symbol.kind,
      signature: symbol.signature,
      returnType: symbol.returnType,
      doc: symbol.doc,
      heritage: [],
      isExported: symbol.isExported,
      parentSymbolName: symbol.parentSymbolLocalKey
        ? file.symbols.find((candidate) => candidate.localKey === symbol.parentSymbolLocalKey)
            ?.displayName ?? null
        : null,
      startLine: symbol.line,
      startCol: symbol.col,
      endLine: symbol.endLine,
      endCol: symbol.endCol,
    })),
    blastRadius: {
      totalCount: file.importedBy.length,
      directCount: file.importedBy.length,
      maxDepth: file.importedBy.length > 0 ? 1 : 0,
      hasCycles: false,
      files: file.importedBy.map((incoming) => {
        const source = input.index.files.find(
          (candidate) => candidate.path === incoming.sourceFilePath,
        );
        return {
          path: incoming.sourceFilePath,
          language: source?.language ?? null,
          depth: 1,
          incomingCount: source?.importedBy.length ?? 0,
          outgoingCount: outgoingCount(incoming.sourceFilePath),
        };
      }),
    },
    cycles: [],
  };
}

export async function ensureLocalIndexWithSummary(input?: { force?: boolean }) {
  const index = await ensureLocalIndex(input);
  return {
    index,
    summary: await getLocalIndexSummary(index),
  };
}
