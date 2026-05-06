import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type {
  ParsedExportDraft,
  ParsedImportDraft,
  ParsedSymbolDraft,
  WorkspaceFileCandidate,
} from "@codemap/code-index";
import type {
  CodebaseSearchResponse,
  FileContent,
  SearchExportResult,
  SearchFileResult,
  SearchSymbolResult,
} from "./api-types.js";

export interface LocalIndexSummary {
  workspaceRootPath: string;
  cachePath: string;
  indexedAt: string | null;
  fileCount: number;
  symbolCount: number;
  stale: boolean;
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

export interface LocalFileParseResponse {
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
    sourceModuleSpecifier: null;
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

function stableId(...parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => String(part ?? ""))
    .join(":")
    .replace(/[^a-zA-Z0-9:_./#-]/g, "_");
}

function terms(query: string): string[] {
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

function resolveContentStatus(
  isBinary: boolean,
  parseStatus: string,
  content: string | null,
): FileContent["status"] {
  if (content != null) return "ready";
  if (isBinary) return "binary";
  if (parseStatus === "too_large") return "too_large";
  if (parseStatus === "unsupported") return "unsupported";
  return "unavailable";
}

export function sqliteIndexDbPath(workspaceRootPath: string) {
  return path.join(workspaceRootPath, ".codemap", "local-index.db");
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE IF NOT EXISTS manifest (
    path TEXT PRIMARY KEY,
    sizeBytes INTEGER NOT NULL,
    contentSha256 TEXT,
    parseStatus TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,
    dirPath TEXT NOT NULL,
    baseName TEXT NOT NULL,
    extension TEXT,
    language TEXT,
    mimeType TEXT,
    sizeBytes INTEGER NOT NULL,
    lineCount INTEGER,
    parseStatus TEXT NOT NULL,
    isBinary INTEGER NOT NULL,
    isText INTEGER NOT NULL,
    contentSha256 TEXT,
    content TEXT
  );

  CREATE TABLE IF NOT EXISTS symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filePath TEXT NOT NULL,
    localKey TEXT NOT NULL,
    stableKey TEXT NOT NULL,
    displayName TEXT NOT NULL,
    kind TEXT NOT NULL,
    signature TEXT,
    returnType TEXT,
    doc TEXT,
    isExported INTEGER NOT NULL,
    parentSymbolLocalKey TEXT,
    line INTEGER,
    col INTEGER,
    endLine INTEGER,
    endCol INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_symbols_filePath ON symbols(filePath);
  CREATE INDEX IF NOT EXISTS idx_symbols_displayName ON symbols(lower(displayName));

  CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filePath TEXT NOT NULL,
    localKey TEXT NOT NULL,
    moduleSpecifier TEXT NOT NULL,
    importKind TEXT NOT NULL,
    resolutionKind TEXT NOT NULL,
    targetPathText TEXT,
    targetExternalSymbolKey TEXT,
    line INTEGER NOT NULL,
    col INTEGER NOT NULL,
    endLine INTEGER NOT NULL,
    endCol INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_imports_filePath ON imports(filePath);

  CREATE TABLE IF NOT EXISTS imported_by (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    targetFilePath TEXT NOT NULL,
    sourceFilePath TEXT NOT NULL,
    moduleSpecifier TEXT NOT NULL,
    importKind TEXT NOT NULL,
    resolutionKind TEXT NOT NULL,
    startLine INTEGER NOT NULL,
    startCol INTEGER NOT NULL,
    endLine INTEGER NOT NULL,
    endCol INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ib_target ON imported_by(targetFilePath);
  CREATE INDEX IF NOT EXISTS idx_ib_source ON imported_by(sourceFilePath);

  CREATE TABLE IF NOT EXISTS exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filePath TEXT NOT NULL,
    exportName TEXT NOT NULL,
    exportKind TEXT NOT NULL,
    symbolLocalKey TEXT,
    line INTEGER NOT NULL,
    col INTEGER NOT NULL,
    endLine INTEGER NOT NULL,
    endCol INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_exports_filePath ON exports(filePath);
  CREATE INDEX IF NOT EXISTS idx_exports_exportName ON exports(lower(exportName));
`;

export class SQLiteIndexStore {
  private db: DatabaseSync;
  readonly dbPath: string;

  private constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
    this.db.exec(SCHEMA_SQL);
  }

  static open(dbPath: string): SQLiteIndexStore {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    return new SQLiteIndexStore(dbPath);
  }

  static exists(dbPath: string): boolean {
    return existsSync(dbPath);
  }

  getMeta(): { indexedAt: string; commitSha: string | null; workspaceRootPath: string; cachePath: string } | null {
    const rows = this.db
      .prepare("SELECT key, value FROM meta")
      .all() as Array<{ key: string; value: string | null }>;
    if (rows.length === 0) return null;
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    if (!m["indexedAt"] || !m["workspaceRootPath"]) return null;
    return {
      indexedAt: m["indexedAt"] as string,
      commitSha: (m["commitSha"] as string | null | undefined) ?? null,
      workspaceRootPath: m["workspaceRootPath"] as string,
      cachePath: (m["cachePath"] as string | null | undefined) ?? this.dbPath,
    };
  }

  isStale(currentFiles: WorkspaceFileCandidate[]): boolean {
    const manifestRows = this.db
      .prepare("SELECT path, sizeBytes, contentSha256, parseStatus FROM manifest ORDER BY path")
      .all() as Array<{ path: string; sizeBytes: number; contentSha256: string | null; parseStatus: string }>;

    if (manifestRows.length !== currentFiles.length) return true;

    const sorted = [...currentFiles].sort((a, b) => a.path.localeCompare(b.path));
    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      const m = manifestRows[i];
      if (
        f.path !== m.path ||
        f.sizeBytes !== m.sizeBytes ||
        (f.contentSha256 ?? null) !== m.contentSha256 ||
        f.parseStatus !== m.parseStatus
      ) {
        return true;
      }
    }
    return false;
  }

  getSummary(stale = false): LocalIndexSummary {
    const meta = this.getMeta();
    const fileCount = (
      this.db.prepare("SELECT COUNT(*) as n FROM files").get() as { n: number }
    ).n;
    const symbolCount = (
      this.db.prepare("SELECT COUNT(*) as n FROM symbols").get() as { n: number }
    ).n;
    return {
      workspaceRootPath: meta?.workspaceRootPath ?? "",
      cachePath: meta?.cachePath ?? this.dbPath,
      indexedAt: meta?.indexedAt ?? null,
      fileCount,
      symbolCount,
      stale,
    };
  }

  write(
    files: LocalIndexedFile[],
    meta: {
      indexedAt: string;
      commitSha: string | null;
      workspaceRootPath: string;
      cachePath: string;
      parserName: string;
      parserVersion: string;
    },
  ): void {
    this.db.exec("BEGIN");
    try {
      this.db.exec(
        "DELETE FROM meta; DELETE FROM manifest; DELETE FROM files; DELETE FROM symbols; DELETE FROM imports; DELETE FROM imported_by; DELETE FROM exports;",
      );

      const insertMeta = this.db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)");
      insertMeta.run("indexedAt", meta.indexedAt);
      insertMeta.run("commitSha", meta.commitSha ?? null);
      insertMeta.run("workspaceRootPath", meta.workspaceRootPath);
      insertMeta.run("cachePath", meta.cachePath);
      insertMeta.run("parserName", meta.parserName);
      insertMeta.run("parserVersion", meta.parserVersion);

      const insertManifest = this.db.prepare(
        "INSERT INTO manifest(path, sizeBytes, contentSha256, parseStatus) VALUES(?, ?, ?, ?)",
      );
      const insertFile = this.db.prepare(
        "INSERT INTO files(path, dirPath, baseName, extension, language, mimeType, sizeBytes, lineCount, parseStatus, isBinary, isText, contentSha256, content) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const insertSymbol = this.db.prepare(
        "INSERT INTO symbols(filePath, localKey, stableKey, displayName, kind, signature, returnType, doc, isExported, parentSymbolLocalKey, line, col, endLine, endCol) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const insertImport = this.db.prepare(
        "INSERT INTO imports(filePath, localKey, moduleSpecifier, importKind, resolutionKind, targetPathText, targetExternalSymbolKey, line, col, endLine, endCol) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const insertImportedBy = this.db.prepare(
        "INSERT INTO imported_by(targetFilePath, sourceFilePath, moduleSpecifier, importKind, resolutionKind, startLine, startCol, endLine, endCol) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const insertExport = this.db.prepare(
        "INSERT INTO exports(filePath, exportName, exportKind, symbolLocalKey, line, col, endLine, endCol) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
      );

      for (const file of files) {
        insertManifest.run(file.path, file.sizeBytes, file.contentSha256 ?? null, file.parseStatus);
        insertFile.run(
          file.path, file.dirPath, file.baseName,
          file.extension ?? null, file.language ?? null, file.mimeType ?? null,
          file.sizeBytes, file.lineCount ?? null, file.parseStatus,
          file.isBinary ? 1 : 0, file.isText ? 1 : 0,
          file.contentSha256 ?? null, file.content ?? null,
        );
        for (const sym of file.symbols) {
          insertSymbol.run(
            file.path, sym.localKey, sym.stableKey, sym.displayName, sym.kind,
            sym.signature ?? null, sym.returnType ?? null, sym.doc ?? null,
            sym.isExported ? 1 : 0, sym.parentSymbolLocalKey ?? null,
            sym.line, sym.col, sym.endLine, sym.endCol,
          );
        }
        for (const imp of file.imports) {
          insertImport.run(
            file.path, imp.localKey, imp.moduleSpecifier, imp.importKind, imp.resolutionKind,
            imp.targetPathText ?? null, imp.targetExternalSymbolKey ?? null,
            imp.line, imp.col, imp.endLine, imp.endCol,
          );
        }
        for (const ib of file.importedBy) {
          insertImportedBy.run(
            file.path, ib.sourceFilePath, ib.moduleSpecifier, ib.importKind, ib.resolutionKind,
            ib.startLine, ib.startCol, ib.endLine, ib.endCol,
          );
        }
        for (const exp of file.exports) {
          insertExport.run(
            file.path, exp.exportName, exp.exportKind, exp.symbolLocalKey ?? null,
            exp.line, exp.col, exp.endLine, exp.endCol,
          );
        }
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  search(query: string, symbolKinds: string[] | null): CodebaseSearchResponse {
    const queryTerms = terms(query);
    if (queryTerms.length === 0) return { files: [], symbols: [], exports: [] };

    const likeConds = (col: string) => queryTerms.map(() => `LOWER(${col}) LIKE ?`).join(" AND ");
    const likeArgs = (col: string = "") => queryTerms.map((t) => `%${col}${t}%`);

    // Files
    const fileRows = this.db
      .prepare(`SELECT path, language FROM files WHERE ${likeConds("path")} LIMIT 50`)
      .all(...likeArgs()) as Array<{ path: string; language: string | null }>;

    const files: SearchFileResult[] = fileRows
      .filter((r) => includesAll(r.path, queryTerms))
      .sort((a, b) => scoreText(b.path, queryTerms, 0) - scoreText(a.path, queryTerms, 0))
      .slice(0, 25)
      .map((r) => ({ kind: "file" as const, path: r.path, language: r.language }));

    // Symbols
    const symTermCond = `(${likeConds("s.displayName")} OR ${likeConds("s.filePath")})`;
    const symArgs: (string | null)[] = [...likeArgs(), ...likeArgs()];
    let symSql = `
      SELECT s.filePath, s.localKey, s.stableKey, s.displayName, s.kind, s.signature,
             s.parentSymbolLocalKey, s.line, s.col, s.endLine, s.endCol
      FROM symbols s
      WHERE ${symTermCond}
    `;
    if (symbolKinds && symbolKinds.length > 0) {
      symSql += ` AND s.kind IN (${symbolKinds.map(() => "?").join(",")})`;
      symArgs.push(...symbolKinds);
    }
    symSql += " LIMIT 50";

    type SymRow = {
      filePath: string; localKey: string; stableKey: string; displayName: string; kind: string;
      signature: string | null; parentSymbolLocalKey: string | null;
      line: number | null; col: number | null; endLine: number | null; endCol: number | null;
    };
    const symRows = this.db.prepare(symSql).all(...symArgs) as SymRow[];

    // Resolve parent display names in one batch
    const parentKeys = [...new Set(symRows.map((r) => r.parentSymbolLocalKey).filter(Boolean) as string[])];
    const parentNameMap = new Map<string, string>();
    if (parentKeys.length > 0) {
      const parentRows = this.db
        .prepare(`SELECT localKey, displayName FROM symbols WHERE localKey IN (${parentKeys.map(() => "?").join(",")})`)
        .all(...parentKeys) as Array<{ localKey: string; displayName: string }>;
      for (const pr of parentRows) parentNameMap.set(pr.localKey, pr.displayName);
    }

    const symbols: SearchSymbolResult[] = symRows
      .filter((r) => includesAll(`${r.displayName} ${r.signature ?? ""} ${r.filePath}`, queryTerms))
      .sort(
        (a, b) =>
          scoreText(`${b.displayName} ${b.filePath}`, queryTerms, 0) -
          scoreText(`${a.displayName} ${a.filePath}`, queryTerms, 0),
      )
      .slice(0, 25)
      .map((r) => ({
        kind: "symbol" as const,
        id: stableId(r.filePath, r.stableKey),
        displayName: r.displayName,
        symbolKind: r.kind,
        signature: r.signature,
        filePath: r.filePath,
        parentSymbolName: r.parentSymbolLocalKey ? (parentNameMap.get(r.parentSymbolLocalKey) ?? null) : null,
        startLine: r.line,
        startCol: r.col,
        endLine: r.endLine,
        endCol: r.endCol,
      }));

    // Exports
    type ExpRow = {
      filePath: string; exportName: string; exportKind: string;
      symbolLocalKey: string | null; line: number; col: number; endLine: number; endCol: number;
    };
    const expRows = this.db
      .prepare(
        `SELECT e.filePath, e.exportName, e.exportKind, e.symbolLocalKey, e.line, e.col, e.endLine, e.endCol
         FROM exports e
         WHERE (${likeConds("e.exportName")} OR ${likeConds("e.filePath")})
         LIMIT 50`,
      )
      .all(...likeArgs(), ...likeArgs()) as ExpRow[];

    const expSymKeys = [...new Set(expRows.map((r) => r.symbolLocalKey).filter(Boolean) as string[])];
    const expSymMap = new Map<string, { stableKey: string; displayName: string; line: number; col: number; endLine: number; endCol: number }>();
    if (expSymKeys.length > 0) {
      const symInfoRows = this.db
        .prepare(
          `SELECT localKey, stableKey, displayName, line, col, endLine, endCol FROM symbols WHERE localKey IN (${expSymKeys.map(() => "?").join(",")})`,
        )
        .all(...expSymKeys) as Array<{ localKey: string; stableKey: string; displayName: string; line: number; col: number; endLine: number; endCol: number }>;
      for (const sr of symInfoRows) expSymMap.set(sr.localKey, sr);
    }

    const exports: SearchExportResult[] = expRows
      .filter((r) => includesAll(`${r.exportName} ${r.filePath}`, queryTerms))
      .sort(
        (a, b) =>
          scoreText(`${b.exportName} ${b.filePath}`, queryTerms, 0) -
          scoreText(`${a.exportName} ${a.filePath}`, queryTerms, 0),
      )
      .slice(0, 25)
      .map((r) => {
        const sym = r.symbolLocalKey ? (expSymMap.get(r.symbolLocalKey) ?? null) : null;
        return {
          kind: "export" as const,
          id: stableId(r.filePath, "export", r.exportName, r.line, r.col),
          exportName: r.exportName,
          filePath: r.filePath,
          symbolId: sym ? stableId(r.filePath, sym.stableKey) : null,
          symbolStartLine: sym?.line ?? null,
          symbolStartCol: sym?.col ?? null,
          symbolEndLine: sym?.endLine ?? null,
          symbolEndCol: sym?.endCol ?? null,
          startLine: r.line,
          startCol: r.col,
          endLine: r.endLine,
          endCol: r.endCol,
        };
      });

    return { files, symbols, exports };
  }

  getFileContent(filePath: string, startLine?: number, endLine?: number): FileContent | null {
    type FileRow = {
      path: string; baseName: string; extension: string | null; language: string | null;
      mimeType: string | null; sizeBytes: number; parseStatus: string;
      isBinary: number; content: string | null;
    };
    const row = this.db
      .prepare(
        "SELECT path, baseName, extension, language, mimeType, sizeBytes, parseStatus, isBinary, content FROM files WHERE path = ?",
      )
      .get(filePath) as FileRow | undefined;

    if (!row) return null;

    const isBinary = row.isBinary === 1;
    let content = row.content;

    if (content && (startLine !== undefined || endLine !== undefined)) {
      const lines = content.split("\n");
      const start = Math.max(1, startLine ?? 1);
      const end = Math.min(lines.length, endLine ?? lines.length);
      content = lines.slice(start - 1, end).join("\n");
    }

    return {
      path: row.path,
      name: row.baseName,
      type: "file",
      extension: row.extension,
      language: row.language,
      kind: isBinary ? "binary" : "text",
      mimeType: row.mimeType,
      status: resolveContentStatus(isBinary, row.parseStatus, row.content),
      content,
      sizeBytes: row.sizeBytes,
      reason: content ? null : row.parseStatus,
    };
  }

  getFileParse(filePath: string): LocalFileParseResponse | null {
    type FileRow = {
      path: string; language: string | null; lineCount: number | null;
      parseStatus: string; sizeBytes: number; mimeType: string | null; extension: string | null;
    };
    const fileRow = this.db
      .prepare(
        "SELECT path, language, lineCount, parseStatus, sizeBytes, mimeType, extension FROM files WHERE path = ?",
      )
      .get(filePath) as FileRow | undefined;

    if (!fileRow) return null;

    const importRows = this.db
      .prepare(
        "SELECT localKey, moduleSpecifier, importKind, resolutionKind, targetPathText, targetExternalSymbolKey, line, col, endLine, endCol FROM imports WHERE filePath = ? ORDER BY line",
      )
      .all(filePath) as Array<{
        localKey: string; moduleSpecifier: string; importKind: string; resolutionKind: string;
        targetPathText: string | null; targetExternalSymbolKey: string | null;
        line: number; col: number; endLine: number; endCol: number;
      }>;

    const importedByRows = this.db
      .prepare(
        "SELECT sourceFilePath, moduleSpecifier, importKind, resolutionKind, startLine, startCol, endLine, endCol FROM imported_by WHERE targetFilePath = ? ORDER BY startLine",
      )
      .all(filePath) as Array<{
        sourceFilePath: string; moduleSpecifier: string; importKind: string; resolutionKind: string;
        startLine: number; startCol: number; endLine: number; endCol: number;
      }>;

    type SymRow = {
      localKey: string; stableKey: string; displayName: string; kind: string;
      signature: string | null; returnType: string | null; doc: string | null;
      isExported: number; parentSymbolLocalKey: string | null;
      line: number | null; col: number | null; endLine: number | null; endCol: number | null;
    };
    const symbolRows = this.db
      .prepare(
        "SELECT localKey, stableKey, displayName, kind, signature, returnType, doc, isExported, parentSymbolLocalKey, line, col, endLine, endCol FROM symbols WHERE filePath = ? ORDER BY line",
      )
      .all(filePath) as SymRow[];

    const symbolByLocalKey = new Map(symbolRows.map((s) => [s.localKey, s]));

    type ExpRow = {
      exportName: string; exportKind: string; symbolLocalKey: string | null;
      line: number; col: number; endLine: number; endCol: number;
    };
    const exportRows = this.db
      .prepare(
        "SELECT exportName, exportKind, symbolLocalKey, line, col, endLine, endCol FROM exports WHERE filePath = ? ORDER BY line",
      )
      .all(filePath) as ExpRow[];

    // Blast radius: batch-query incoming/outgoing counts for all source files
    const sourceFiles = [...new Set(importedByRows.map((r) => r.sourceFilePath))];
    type BrRow = { sourceFilePath: string; language: string | null; incomingCount: number; outgoingCount: number };
    const blastRadiusRows: BrRow[] = sourceFiles.length > 0
      ? (this.db
          .prepare(
            `SELECT
               ib.sourceFilePath,
               f.language,
               (SELECT COUNT(*) FROM imported_by WHERE targetFilePath = ib.sourceFilePath) as incomingCount,
               (SELECT COUNT(*) FROM imports WHERE filePath = ib.sourceFilePath) as outgoingCount
             FROM imported_by ib
             LEFT JOIN files f ON f.path = ib.sourceFilePath
             WHERE ib.targetFilePath = ?
             GROUP BY ib.sourceFilePath`,
          )
          .all(filePath) as BrRow[])
      : [];

    return {
      file: {
        fileId: stableId(filePath),
        path: fileRow.path,
        language: fileRow.language,
        lineCount: fileRow.lineCount,
        parseStatus: fileRow.parseStatus,
        sizeBytes: fileRow.sizeBytes,
        mimeType: fileRow.mimeType,
        extension: fileRow.extension,
        importParseStatus: "completed",
      },
      imports: importRows.map((imp) => ({
        id: stableId(filePath, "import", imp.localKey),
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
      importedBy: importedByRows.map((ib) => ({
        sourceFilePath: ib.sourceFilePath,
        moduleSpecifier: ib.moduleSpecifier,
        importKind: ib.importKind,
        resolutionKind: ib.resolutionKind,
        startLine: ib.startLine,
        startCol: ib.startCol,
        endLine: ib.endLine,
        endCol: ib.endCol,
      })),
      exports: exportRows.map((exp) => {
        const sym = exp.symbolLocalKey ? (symbolByLocalKey.get(exp.symbolLocalKey) ?? null) : null;
        return {
          id: stableId(filePath, "export", exp.exportName, exp.line, exp.col),
          symbolId: sym ? stableId(filePath, sym.stableKey) : null,
          exportName: exp.exportName,
          exportKind: exp.exportKind,
          symbolDisplayName: sym?.displayName ?? null,
          sourceModuleSpecifier: null,
          symbolStartLine: sym?.line ?? null,
          symbolStartCol: sym?.col ?? null,
          symbolEndLine: sym?.endLine ?? null,
          symbolEndCol: sym?.endCol ?? null,
          startLine: exp.line,
          startCol: exp.col,
          endLine: exp.endLine,
          endCol: exp.endCol,
        };
      }),
      symbols: symbolRows.map((sym) => {
        const parent = sym.parentSymbolLocalKey
          ? (symbolByLocalKey.get(sym.parentSymbolLocalKey) ?? null)
          : null;
        return {
          id: stableId(filePath, sym.stableKey),
          displayName: sym.displayName,
          kind: sym.kind,
          signature: sym.signature,
          returnType: sym.returnType,
          doc: sym.doc,
          heritage: [],
          isExported: sym.isExported === 1,
          parentSymbolName: parent?.displayName ?? null,
          startLine: sym.line,
          startCol: sym.col,
          endLine: sym.endLine,
          endCol: sym.endCol,
        };
      }),
      blastRadius: {
        totalCount: importedByRows.length,
        directCount: importedByRows.length,
        maxDepth: importedByRows.length > 0 ? 1 : 0,
        hasCycles: false,
        files: blastRadiusRows.map((r) => ({
          path: r.sourceFilePath,
          language: r.language,
          depth: 1,
          incomingCount: r.incomingCount,
          outgoingCount: r.outgoingCount,
        })),
      },
      cycles: [],
    };
  }

  close(): void {
    this.db.close();
  }
}
