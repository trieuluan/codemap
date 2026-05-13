import path from "node:path";
import {
  collectWorkspaceFiles,
  loadTypeScriptResolverConfigs,
  parseWorkspaceFileSemantics,
  PARSE_TOOL_NAME,
  PARSE_TOOL_VERSION,
} from "@codemap/code-index";
import { resolveWorkspace } from "./workspace-resolver.js";
import type { CodeMapClient } from "./codemap-api.js";
import { fetchLatestProjectImport } from "./import-health.js";
import {
  SQLiteIndexStore,
  sqliteIndexDbPath,
} from "./sqlite-index-store.js";
import type {
  LocalIndexedFile,
  LocalImportedBy,
  LocalIndexSummary,
} from "./sqlite-index-store.js";

export type {
  LocalIndexedFile,
  LocalImportedBy,
  LocalIndexSummary,
  LocalFileParseResponse,
  SQLiteIndexStore,
} from "./sqlite-index-store.js";

// Module-level cache — reused across tool calls in the same MCP server process
let _cachedStore: SQLiteIndexStore | null = null;

function toLocalFile(
  file: Awaited<ReturnType<typeof collectWorkspaceFiles>>[number],
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
  const byPath = new Map(files.map((f) => [f.path, f]));
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
      } satisfies LocalImportedBy);
    }
  }
}

export async function buildLocalIndex(input?: {
  workspaceRootPath?: string;
}): Promise<SQLiteIndexStore> {
  const resolved = input?.workspaceRootPath
    ? {
        workspaceRootPath: input.workspaceRootPath,
        workspace: await resolveWorkspace({ cwd: input.workspaceRootPath }).then(
          (w) => w.workspace,
        ),
      }
    : await resolveWorkspace();

  const workspaceRootPath = resolved.workspaceRootPath;
  const dbPath = sqliteIndexDbPath(workspaceRootPath);
  const files = await collectWorkspaceFiles(workspaceRootPath);
  const filePathSet = new Set(files.map((f) => f.path));
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

  const store = SQLiteIndexStore.open(dbPath);
  store.write(indexedFiles, {
    indexedAt: new Date().toISOString(),
    commitSha: resolved.workspace?.commitSha ?? null,
    workspaceRootPath,
    cachePath: dbPath,
    parserName: PARSE_TOOL_NAME,
    parserVersion: PARSE_TOOL_VERSION,
  });

  _cachedStore = store;
  return store;
}

export async function readLocalIndex(workspaceRootPath?: string): Promise<SQLiteIndexStore | null> {
  const workspace = workspaceRootPath
    ? { workspaceRootPath }
    : await resolveWorkspace();
  const dbPath = sqliteIndexDbPath(workspace.workspaceRootPath);
  if (!SQLiteIndexStore.exists(dbPath)) return null;
  try {
    const store = SQLiteIndexStore.open(dbPath);
    if (!store.getMeta()) return null;
    return store;
  } catch {
    return null;
  }
}

export async function isLocalIndexStale(store: SQLiteIndexStore): Promise<boolean> {
  const meta = store.getMeta();
  if (!meta) return true;
  try {
    const files = await collectWorkspaceFiles(meta.workspaceRootPath);
    return store.isStale(files);
  } catch {
    return true;
  }
}

async function collectFilesForStore(store: SQLiteIndexStore) {
  const meta = store.getMeta();
  if (!meta) return [];
  try {
    return await collectWorkspaceFiles(meta.workspaceRootPath);
  } catch {
    return [];
  }
}

export async function ensureLocalIndex(input?: {
  force?: boolean;
  workspaceRootPath?: string;
}): Promise<SQLiteIndexStore> {
  if (input?.force) {
    _cachedStore = null;
    return buildLocalIndex(input);
  }

  if (_cachedStore) {
    const files = await collectFilesForStore(_cachedStore);
    if (files.length > 0 && !_cachedStore.isStale(files)) return _cachedStore;
    _cachedStore = null;
  }

  const existing = await readLocalIndex(input?.workspaceRootPath);
  if (existing) {
    const files = await collectFilesForStore(existing);
    if (files.length > 0 && !existing.isStale(files)) {
      _cachedStore = existing;
      return existing;
    }
  }

  return buildLocalIndex(input);
}

export async function getLocalIndexSummary(store: SQLiteIndexStore): Promise<LocalIndexSummary> {
  const files = await collectFilesForStore(store);
  return store.getSummary(files.length > 0 ? store.isStale(files) : false);
}

export async function ensureLocalIndexWithSummary(input?: { force?: boolean }) {
  const store = await ensureLocalIndex(input);
  const summary = store.getSummary(false);
  return { store, summary };
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

export function localIndexCachePath(workspaceRootPath: string) {
  return path.join(workspaceRootPath, ".codemap", "local-index.db");
}

/**
 * Normalize a file path to be repo-relative.
 * If an absolute path is given (e.g. from bash output or another tool),
 * strip the workspace root prefix so get_file / get_files can find it in the index.
 * Returns the path unchanged if it is already relative or not under the workspace root.
 */
export function toRepoRelativePath(filePath: string, workspaceRootPath: string): string {
  const normalized = path.normalize(filePath);
  const root = path.normalize(workspaceRootPath);
  if (path.isAbsolute(normalized) && normalized.startsWith(root)) {
    const rel = normalized.slice(root.length);
    return rel.startsWith(path.sep) ? rel.slice(1) : rel;
  }
  return filePath;
}
