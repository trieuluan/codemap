import nodePath from "node:path";
import { readFile } from "node:fs/promises";
import type { db } from "../../../db";
import type { ProjectFileRecord, projectImport } from "../../../db/schema";
import { createRepoParseGraphService } from "./repo-parse-graph";

type ProjectImportRecord = typeof projectImport.$inferSelect;
import {
  buildFileSha256,
  inferLanguage,
  inferMimeType,
  loadTypeScriptResolverConfigs,
  normalizeExtension,
  parseWorkspaceFileSemantics,
  type WorkspaceFileCandidate,
} from "./runner";

type Database = typeof db;

export interface ReparseResult {
  reparsed: boolean;
  reason?: "already_fresh" | "unsupported_language";
}

export async function reparseFileIfStale(
  database: Database,
  importRecord: ProjectImportRecord,
  fileRecord: ProjectFileRecord,
  content: string,
  contentHash: string,
): Promise<ReparseResult> {
  const repoParseGraphService = createRepoParseGraphService(database);
  const workspacePath = importRecord.sourceWorkspacePath ?? "";

  // Compare hash of retained workspace file vs hash sent by client
  if (workspacePath) {
    try {
      const storedContent = await readFile(
        nodePath.join(workspacePath, fileRecord.path),
        "utf8",
      );
      const storedHash = buildFileSha256(storedContent);
      if (storedHash === contentHash) {
        return { reparsed: false, reason: "already_fresh" };
      }
    } catch {
      // File not readable in workspace — proceed with reparse
    }
  }

  const ext = normalizeExtension(nodePath.basename(fileRecord.path));
  const language = fileRecord.language ?? inferLanguage(ext);

  if (!language) {
    return { reparsed: false, reason: "unsupported_language" };
  }

  const allFiles = await repoParseGraphService.listFiles(importRecord.id);
  const filePathSet = new Set(allFiles.map((f) => f.path));
  const resolverConfigs = workspacePath
    ? await loadTypeScriptResolverConfigs(workspacePath).catch(() => [])
    : [];

  const fileCandidate: WorkspaceFileCandidate = {
    path: fileRecord.path,
    absolutePath: workspacePath
      ? nodePath.join(workspacePath, fileRecord.path)
      : fileRecord.path,
    dirPath:
      nodePath.posix.dirname(fileRecord.path) === "."
        ? ""
        : nodePath.posix.dirname(fileRecord.path),
    baseName: nodePath.basename(fileRecord.path),
    extension: ext,
    language,
    mimeType: inferMimeType(ext),
    sizeBytes: Buffer.byteLength(content, "utf8"),
    contentSha256: contentHash,
    isText: true,
    isBinary: false,
    isGenerated: false,
    isIgnored: false,
    ignoreReason: null,
    isParseable: true,
    parseStatus: "parsed",
    parserName: "codemap-regex-parser",
    parserVersion: "0.1.0",
    lineCount: content.split(/\r?\n/).length,
    content,
  };

  const semantics = parseWorkspaceFileSemantics({
    file: fileCandidate,
    filePathSet,
    projectImportId: importRecord.id,
    workspacePath,
    resolverConfigs,
  });

  const fileRowByPath = new Map(allFiles.map((f) => [f.path, f]));

  const symbolDrafts = semantics.symbols.map((sym) => ({
    projectImportId: importRecord.id,
    fileId: fileRecord.id,
    stableSymbolKey: sym.stableKey,
    localSymbolKey: sym.localKey,
    displayName: sym.displayName,
    kind: sym.kind,
    language: sym.language,
    visibility: "unknown" as const,
    isExported: sym.isExported,
    isDefaultExport: sym.isDefaultExport,
    signature: sym.signature,
    returnType: null,
    parentSymbolId: null,
    ownerSymbolKey: null,
    docJson: sym.doc ? { text: sym.doc } : null,
    typeJson: null,
    modifiersJson: null,
    extraJson: { line: sym.line, col: sym.col } as unknown,
  }));

  const importEdgeDrafts = semantics.imports.map((imp) => {
    const targetFile = imp.targetPathText
      ? fileRowByPath.get(imp.targetPathText)
      : null;
    return {
      localKey: imp.localKey,
      projectImportId: importRecord.id,
      sourceFileId: fileRecord.id,
      targetFileId: targetFile?.id ?? null,
      targetPathText: imp.targetPathText,
      targetExternalSymbolKey: imp.targetExternalSymbolKey,
      moduleSpecifier: imp.moduleSpecifier,
      importKind: imp.importKind,
      isTypeOnly: imp.isTypeOnly,
      isResolved: Boolean(targetFile || imp.targetExternalSymbolKey),
      resolutionKind: imp.resolutionKind,
      startLine: imp.line,
      startCol: imp.col,
      endLine: imp.line,
      endCol: imp.endCol,
      extraJson: null,
    };
  });

  const exportDrafts = semantics.exports.map((exp) => ({
    projectImportId: importRecord.id,
    fileId: fileRecord.id,
    symbolId: null,
    exportName: exp.exportName,
    exportKind: exp.exportKind,
    sourceImportEdgeId: null,
    targetExternalSymbolKey: exp.targetExternalSymbolKey ?? null,
    startLine: exp.line,
    startCol: exp.col,
    endLine: exp.line,
    endCol: exp.endCol,
    extraJson: null,
    symbolLocalKey: exp.symbolLocalKey,
    sourceImportLocalKey: exp.sourceImportLocalKey,
  }));

  const issueDrafts = semantics.issues.map((issue) => ({
    ...issue,
    fileId: fileRecord.id,
  }));

  await repoParseGraphService.clearAndResyncFileData(
    importRecord.id,
    fileRecord,
    {
      contentSha256: contentHash,
      lineCount: fileCandidate.lineCount,
      symbols: symbolDrafts,
      importEdges: importEdgeDrafts,
      exports: exportDrafts,
      issues: issueDrafts,
      externalSymbols: semantics.externalSymbols.map((s) => ({
        ...s,
        projectImportId: importRecord.id,
      })),
    },
  );

  return { reparsed: true };
}
