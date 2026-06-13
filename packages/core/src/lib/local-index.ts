import path from "node:path";
import {
  collectSingleFile,
  collectWorkspaceFiles,
  loadTypeScriptResolverConfigs,
  parseWorkspaceFileSemantics,
  PARSE_TOOL_NAME,
  PARSE_TOOL_VERSION,
} from "@codemap-ai/code-index";
import { resolveWorkspace } from "./workspace-resolver.ts";
import type { CodeMapClient } from "./codemap-api.ts";
import { fetchLatestProjectImport } from "./import-health.ts";
import {
  SQLiteIndexStore,
  sqliteIndexDbPath,
} from "./sqlite-index-store.ts";
import type {
  LocalIndexedFile,
  LocalImportedBy,
  LocalIndexSummary,
} from "./sqlite-index-store.ts";

export type {
  LocalIndexedFile,
  LocalImportedBy,
  LocalIndexSummary,
  LocalFileParseResponse,
  SQLiteIndexStore,
} from "./sqlite-index-store.ts";

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

/**
 * Incrementally re-index a single file. Updates only the given file's data
 * in the SQLite index without a full workspace scan.
 * Returns true if the file was updated, false if it couldn't be found/read.
 */
export async function refreshLocalFile(
  relativePath: string,
  workspaceRootPath?: string,
): Promise<boolean> {
  // Get or build the store
  const store = _cachedStore ?? await readLocalIndex(workspaceRootPath) ?? await buildLocalIndex({ workspaceRootPath });
  const meta = store.getMeta();
  if (!meta) return false;

  const candidate = await collectSingleFile(relativePath, meta.workspaceRootPath);
  if (!candidate || !candidate.isParseable) return false;

  // Get current file set for import resolution context
  const existingFiles = store.getAllFilePaths();
  const filePathSet = new Set(existingFiles);
  // Ensure the current file is in the set (it may be a new file)
  filePathSet.add(candidate.path);

  const resolverConfigs = await loadTypeScriptResolverConfigs(meta.workspaceRootPath);
  const semantics = await parseWorkspaceFileSemantics({
    file: candidate,
    filePathSet,
    projectImportId: "local",
    workspacePath: meta.workspaceRootPath,
    resolverConfigs,
  });

  const localFile = toLocalFile(candidate, semantics);
  store.upsertFile(localFile);

  // Invalidate cached store so next ensureLocalIndex re-checks freshness
  _cachedStore = null;

  return true;
}

/**
 * Remove a single file from the local SQLite index.
 * Use after delete_file tool to immediately purge stale entries.
 * Returns true if the file was found and removed, false otherwise.
 */
export async function removeLocalFile(
  relativePath: string,
  workspaceRootPath?: string,
): Promise<boolean> {
  const store = _cachedStore ?? await readLocalIndex(workspaceRootPath);
  if (!store) return false;

  const removed = store.removeFileFromIndex(relativePath);
  _cachedStore = null;
  return removed;
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

/**
 * Returns true when the cloud API served a file with status "ready" but no
 * actual text content — which happens when the cloud index is stale relative
 * to local uncommitted edits.  Callers should fall back to the local index.
 */
export function isCloudContentEmpty(
  content: { status: string; content: string | null } | null,
): boolean {
  return content?.status === "ready" && !content.content;
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
 * strip the workspace root prefix so get_file / get_file can find it in the index.
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

/**
 * Batch refresh multiple files' indexes.
 * This is more efficient than calling refreshLocalFile repeatedly.
 */
export async function refreshLocalFiles(
  filePaths: string[],
  workspaceRootPath?: string,
): Promise<void> {
  const store = _cachedStore ?? await readLocalIndex(workspaceRootPath);
  if (!store) {
    throw new Error("Could not access local index store");
  }

  for (const filePath of filePaths) {
    // Reuse existing refreshLocalFile logic
    await refreshLocalFile(filePath, workspaceRootPath);
  }
  
  _cachedStore = null;
}
