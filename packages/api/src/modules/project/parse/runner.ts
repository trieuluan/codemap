import type { Job } from "bullmq";
import { db } from "../../../db";
import type {
  RepoExportInsert,
  RepoImportEdgeInsert,
  RepoSymbolInsert,
  RepoSymbolOccurrenceInsert,
  RepoSymbolRelationshipInsert,
} from "../../../db/schema";
import { createRepositoryWorkspaceService } from "../import/repository-workspace";
import { createProjectService } from "../service";
import { createRepoParseGraphService } from "./repo-parse-graph";
import { collectWorkspaceFiles, PARSE_TOOL_NAME, PARSE_TOOL_VERSION } from "./file-discovery";
import { loadTypeScriptResolverConfigs } from "./ts-resolver";
import { parseWorkspaceFileSemantics } from "./parsers/index";

export type { WorkspaceFileCandidate } from "./file-discovery";
export { normalizeExtension, inferLanguage, inferMimeType, buildFileSha256 } from "./language-utils";
export { loadTypeScriptResolverConfigs } from "./ts-resolver";
export { parseWorkspaceFileSemantics } from "./parsers/index";

interface RunProjectParseContext {
  job?: Job;
}

const projectService = createProjectService(db);
const repoParseGraphService = createRepoParseGraphService(db);
const repositoryWorkspaceService = createRepositoryWorkspaceService();

function toParseFailureMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }
  return "Project parse failed";
}

async function reportProjectParseProgress(
  context: RunProjectParseContext | undefined,
  progress: number,
  stage: string,
) {
  if (!context?.job) return;
  await context.job.updateProgress({ progress, stage });
}

async function cleanupSupersededProjectImports(projectId: string, currentImportId: string) {
  const supersededImports = await projectService.listSupersededImportsWithSource(projectId, currentImportId);

  for (const supersededImport of supersededImports) {
    if (!supersededImport.sourceWorkspacePath) continue;

    try {
      await repositoryWorkspaceService.removeWorkspaceByPath(supersededImport.sourceWorkspacePath);
      await projectService.clearImportSourceMetadata(supersededImport.id);
    } catch (cleanupError) {
      console.error("Unable to clean up superseded retained project workspace", cleanupError);
    }
  }

  try {
    await projectService.deleteSupersededImports(projectId, currentImportId);
  } catch (cleanupError) {
    console.error("Unable to delete superseded project imports", cleanupError);
  }
}

export async function runProjectParse(importId: string, context?: RunProjectParseContext) {
  const importDetails = await projectService.getImportWithProject(importId);

  if (!importDetails) {
    throw new Error(`Project import not found: ${importId}`);
  }

  const { importRecord, projectRecord } = importDetails;

  if (!importRecord.sourceAvailable || !importRecord.sourceWorkspacePath) {
    const errorMessage = "Retained repository source is unavailable for parsing";
    await projectService.markParseAsFailed(importId, errorMessage);
    throw new Error(errorMessage);
  }

  try {
    await projectService.markParseAsRunning(importId, {
      parseTool: PARSE_TOOL_NAME,
      parseToolVersion: PARSE_TOOL_VERSION,
    });
    await reportProjectParseProgress(context, 10, "collecting-files");

    await repoParseGraphService.clearImportData(importId);

    const workspaceFiles = await collectWorkspaceFiles(importRecord.sourceWorkspacePath);
    const resolverConfigs = await loadTypeScriptResolverConfigs(importRecord.sourceWorkspacePath);
    const fileRows = await repoParseGraphService.saveFiles(
      workspaceFiles.map((file) => ({
        projectImportId: importId,
        path: file.path,
        dirPath: file.dirPath,
        baseName: file.baseName,
        extension: file.extension,
        language: file.language,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        contentSha256: file.contentSha256,
        isText: file.isText,
        isBinary: file.isBinary,
        isGenerated: file.isGenerated,
        isIgnored: file.isIgnored,
        ignoreReason: file.ignoreReason,
        isParseable: file.isParseable,
        parseStatus: file.parseStatus,
        parserName: file.parserName,
        parserVersion: file.parserVersion,
        lineCount: file.lineCount,
        extraJson: null,
      })),
    );

    const fileRowByPath = new Map(fileRows.map((file) => [file.path, file] as const));
    const filePathSet = new Set(fileRows.map((file) => file.path));
    const symbolDrafts: RepoSymbolInsert[] = [];
    const occurrenceDrafts: RepoSymbolOccurrenceInsert[] = [];
    const pendingRelationships: Array<{
      fromSymbolLocalKey: string;
      toSymbolName: string;
      relationshipKind: RepoSymbolRelationshipInsert["relationshipKind"];
    }> = [];
    const importEdgeDrafts: Array<RepoImportEdgeInsert & { localKey: string }> = [];
    const exportDrafts: Array<RepoExportInsert & { symbolLocalKey?: string; sourceImportLocalKey?: string }> = [];
    const parseIssues = [];
    const externalSymbols = [];

    await reportProjectParseProgress(context, 45, "parsing-files");

    for (const workspaceFile of workspaceFiles) {
      if (!workspaceFile.isParseable || !workspaceFile.content || !workspaceFile.language) continue;

      const fileRow = fileRowByPath.get(workspaceFile.path);
      if (!fileRow) continue;

      try {
        const semantics = await parseWorkspaceFileSemantics({
          file: workspaceFile,
          filePathSet,
          projectImportId: importId,
          workspacePath: importRecord.sourceWorkspacePath,
          resolverConfigs,
        });

        for (const symbol of semantics.symbols) {
          symbolDrafts.push({
            projectImportId: importId,
            fileId: fileRow.id,
            stableSymbolKey: symbol.stableKey,
            localSymbolKey: symbol.localKey,
            displayName: symbol.displayName,
            kind: symbol.kind,
            language: symbol.language,
            visibility: "unknown",
            isExported: symbol.isExported,
            isDefaultExport: symbol.isDefaultExport,
            signature: symbol.signature,
            returnType: symbol.returnType,
            parentSymbolId: null,
            ownerSymbolKey: null,
            docJson: symbol.doc ? { text: symbol.doc } : null,
            typeJson: null,
            modifiersJson: null,
            extraJson: { line: symbol.line, col: symbol.col },
          });
        }

        for (const issue of semantics.issues) {
          parseIssues.push({ ...issue, fileId: fileRow.id });
        }

        externalSymbols.push(...semantics.externalSymbols);

        for (const importEdge of semantics.imports) {
          const targetFile = importEdge.targetPathText ? fileRowByPath.get(importEdge.targetPathText) : null;
          importEdgeDrafts.push({
            localKey: importEdge.localKey,
            projectImportId: importId,
            sourceFileId: fileRow.id,
            targetFileId: targetFile?.id ?? null,
            targetPathText: importEdge.targetPathText,
            targetExternalSymbolKey: importEdge.targetExternalSymbolKey,
            moduleSpecifier: importEdge.moduleSpecifier,
            importKind: importEdge.importKind,
            importedNames: importEdge.importedNames,
            isTypeOnly: importEdge.isTypeOnly,
            isResolved: Boolean(targetFile || importEdge.targetExternalSymbolKey),
            resolutionKind: importEdge.resolutionKind,
            startLine: importEdge.line,
            startCol: importEdge.col,
            endLine: importEdge.line,
            endCol: importEdge.endCol,
            extraJson: null,
          });
        }

        for (const exported of semantics.exports) {
          exportDrafts.push({
            projectImportId: importId,
            fileId: fileRow.id,
            symbolId: null,
            exportName: exported.exportName,
            exportKind: exported.exportKind,
            sourceImportEdgeId: null,
            targetExternalSymbolKey: exported.targetExternalSymbolKey ?? null,
            startLine: exported.line,
            startCol: exported.col,
            endLine: exported.line,
            endCol: exported.endCol,
            extraJson: null,
            symbolLocalKey: exported.symbolLocalKey,
            sourceImportLocalKey: exported.sourceImportLocalKey,
          });
        }

        pendingRelationships.push(...semantics.relationships);
      } catch (error) {
        parseIssues.push({
          projectImportId: importId,
          fileId: fileRow.id,
          severity: "error" as const,
          code: "FILE_PARSE_ERROR",
          message: toParseFailureMessage(error),
          detailJson: { filePath: workspaceFile.path },
        });
      }
    }

    const savedSymbols = await repoParseGraphService.saveSymbols(symbolDrafts);
    const symbolIdByLocalKey = new Map(
      savedSymbols
        .map((symbol) => [symbol.localSymbolKey, symbol.id] as const)
        .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
    );

    const relationshipDrafts = pendingRelationships
      .map((r) => {
        const fromSymbolId = symbolIdByLocalKey.get(r.fromSymbolLocalKey);
        if (!fromSymbolId) return null;
        return {
          projectImportId: importId,
          fromSymbolId,
          toSymbolId: null,
          toExternalSymbolKey: r.toSymbolName,
          relationshipKind: r.relationshipKind,
          isReference: false,
          isImplementation: r.relationshipKind === "implements",
          isTypeDefinition: false,
          isDefinition: false,
          extraJson: null,
        };
      })
      .filter((r): r is Exclude<typeof r, null> => r !== null);

    await repoParseGraphService.saveRelationships(relationshipDrafts);

    for (const symbol of symbolDrafts) {
      const fileRow = fileRowByPath.get(symbol.localSymbolKey?.split("#")[0] ?? "");
      const symbolId = symbol.localSymbolKey ? symbolIdByLocalKey.get(symbol.localSymbolKey) : null;
      const location = (symbol.extraJson as { line: number; col: number } | null) ?? null;

      if (!fileRow || !symbolId || !location) continue;

      occurrenceDrafts.push({
        projectImportId: importId,
        fileId: fileRow.id,
        symbolId,
        occurrenceRole: "definition",
        startLine: location.line,
        startCol: location.col,
        endLine: location.line,
        endCol: location.col + symbol.displayName.length,
        syntaxKind: symbol.kind,
        snippetPreview: symbol.signature,
        extraJson: null,
      });
    }

    await repoParseGraphService.saveOccurrences(occurrenceDrafts);

    const savedImportEdges = await repoParseGraphService.saveImportEdges(
      importEdgeDrafts.map(({ localKey: _localKey, ...importEdge }) => importEdge),
    );
    const importEdgeIdByLocalKey = new Map<string, string>();
    importEdgeDrafts.forEach((draft, index) => {
      const savedImportEdge = savedImportEdges[index];
      if (savedImportEdge) importEdgeIdByLocalKey.set(draft.localKey, savedImportEdge.id);
    });

    await repoParseGraphService.saveExports(
      exportDrafts.map(({ symbolLocalKey, sourceImportLocalKey, ...exportDraft }) => ({
        ...exportDraft,
        symbolId: symbolLocalKey ? (symbolIdByLocalKey.get(symbolLocalKey) ?? null) : null,
        sourceImportEdgeId: sourceImportLocalKey
          ? (importEdgeIdByLocalKey.get(sourceImportLocalKey) ?? null)
          : null,
      })),
    );
    await repoParseGraphService.saveParseIssues(parseIssues);
    await repoParseGraphService.upsertExternalSymbols(externalSymbols);

    const totalFileCount = fileRows.length;
    const sourceFileCount = fileRows.filter((file) => Boolean(file.language)).length;
    const parsedFileCount = fileRows.filter((file) => file.parseStatus === "parsed").length;
    const dependencyCount = savedImportEdges.length;
    const errorFileCount = parseIssues.filter((issue) => issue.severity === "error").length;
    const skippedFileCount = fileRows.filter((file) => file.parseStatus !== "parsed").length;
    const indexedSymbolCount = savedSymbols.length;

    await reportProjectParseProgress(context, 90, "persisting-parse-results");

    const parseStatsJson = {
      totalFileCount,
      sourceFileCount,
      parsedFileCount,
      dependencyCount,
      skippedFileCount,
      errorFileCount,
    };

    if (errorFileCount > 0) {
      await projectService.markParseAsPartial({
        projectImportId: importId,
        parseError: `${errorFileCount} file(s) could not be parsed completely`,
        indexedFileCount: totalFileCount,
        indexedSymbolCount,
        indexedEdgeCount: dependencyCount,
        parseStatsJson,
      });
    } else {
      await projectService.markParseAsCompleted({
        projectImportId: importId,
        indexedFileCount: totalFileCount,
        indexedSymbolCount,
        indexedEdgeCount: dependencyCount,
        parseStatsJson,
      });
    }

    await reportProjectParseProgress(context, 96, "cleaning-superseded-source");
    await cleanupSupersededProjectImports(projectRecord.id, importId);
    await reportProjectParseProgress(context, 100, "completed");
  } catch (error) {
    await projectService.markParseAsFailed(importId, toParseFailureMessage(error));
    throw error;
  }
}
