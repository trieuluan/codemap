import { asc, eq } from "drizzle-orm";
import { repoFile, repoImportEdge, repoSymbol } from "../../../../db/schema";
import type {
  ProjectImportEdgeDiffEntry,
  ProjectImportFileDiffEntry,
  ProjectImportMetricDelta,
  ProjectImportComparison,
  ProjectImportSymbolDiffEntry,
} from "../types/repo-parse-graph.types";
import { toImportEdge } from "./utils";

type Database = typeof import("../../../../db/index.ts").db;

export function createDiffService(database: Database) {
  return {
    async compareProjectImports(
      baseProjectImportId: string,
      headProjectImportId: string,
      metrics: {
        files: ProjectImportMetricDelta;
        symbols: ProjectImportMetricDelta;
        dependencies: ProjectImportMetricDelta;
      },
    ): Promise<ProjectImportComparison> {
      const [
        baseFiles,
        headFiles,
        baseSymbols,
        headSymbols,
        baseEdges,
        headEdges,
      ] = await Promise.all([
        listFiles(database, baseProjectImportId),
        listFiles(database, headProjectImportId),
        listSymbols(database, baseProjectImportId),
        listSymbols(database, headProjectImportId),
        listEdges(database, baseProjectImportId),
        listEdges(database, headProjectImportId),
      ]);

      return {
        baseImportId: baseProjectImportId,
        headImportId: headProjectImportId,
        files: compareFiles(baseFiles, headFiles),
        symbols: compareSymbols(baseSymbols, headSymbols),
        edges: compareEdges(baseEdges, headEdges),
        metrics: [metrics.files, metrics.symbols, metrics.dependencies],
      };
    },
  };
}

type ParsedRepoFile = typeof repoFile.$inferSelect;
type ParsedRepoSymbol = typeof repoSymbol.$inferSelect & {
  file: { path: string } | null;
};
type ParsedRepoImportEdge = typeof repoImportEdge.$inferSelect & {
  sourceFile: { path: string };
  targetFile: { path: string } | null;
};

type ParsedImportEdge = ReturnType<typeof toImportEdge>;

function listFiles(database: Database, projectImportId: string) {
  return database.query.repoFile.findMany({
    where: eq(repoFile.projectImportId, projectImportId),
    orderBy: [asc(repoFile.path)],
  });
}

function listSymbols(database: Database, projectImportId: string) {
  return database.query.repoSymbol.findMany({
    where: eq(repoSymbol.projectImportId, projectImportId),
    with: { file: true },
    orderBy: [asc(repoSymbol.displayName)],
  });
}

function listEdges(database: Database, projectImportId: string) {
  return database.query.repoImportEdge.findMany({
    where: eq(repoImportEdge.projectImportId, projectImportId),
    with: { sourceFile: true, targetFile: true },
    orderBy: [
      asc(repoImportEdge.sourceFileId),
      asc(repoImportEdge.moduleSpecifier),
      asc(repoImportEdge.startLine),
      asc(repoImportEdge.startCol),
    ],
  });
}

function compareFiles(
  baseFiles: ParsedRepoFile[],
  headFiles: ParsedRepoFile[],
) {
  const baseByPath = new Map(baseFiles.map((file) => [file.path, file] as const));
  const headByPath = new Map(headFiles.map((file) => [file.path, file] as const));

  const added = headFiles
    .filter((file) => !baseByPath.has(file.path))
    .map((file) => toFileDiffEntry(file, "added"));

  const removed = baseFiles
    .filter((file) => !headByPath.has(file.path))
    .map((file) => toFileDiffEntry(file, "removed"));

  const modified = headFiles.flatMap((file) => {
    const baseFile = baseByPath.get(file.path);
    if (!baseFile || !isModifiedFile(baseFile, file)) return [];
    return [toFileDiffEntry(file, "modified")];
  });

  return {
    added: added.sort(compareFileDiffEntries),
    removed: removed.sort(compareFileDiffEntries),
    modified: modified.sort(compareFileDiffEntries),
    totalAdded: added.length,
    totalRemoved: removed.length,
    totalModified: modified.length,
  };
}

function toFileDiffEntry(
  file: ParsedRepoFile,
  change: ProjectImportFileDiffEntry["change"],
): ProjectImportFileDiffEntry {
  return {
    path: file.path,
    change,
    language: file.language,
    extension: file.extension,
    sizeBytes: file.sizeBytes,
    lineCount: file.lineCount,
    parseStatus: file.parseStatus,
  };
}

function isModifiedFile(baseFile: ParsedRepoFile, headFile: ParsedRepoFile) {
  return (
    baseFile.contentSha256 !== headFile.contentSha256 ||
    baseFile.sizeBytes !== headFile.sizeBytes ||
    baseFile.parseStatus !== headFile.parseStatus
  );
}

function compareFileDiffEntries(
  left: ProjectImportFileDiffEntry,
  right: ProjectImportFileDiffEntry,
) {
  return left.path.localeCompare(right.path);
}

function compareSymbols(
  baseSymbols: ParsedRepoSymbol[],
  headSymbols: ParsedRepoSymbol[],
) {
  const baseByKey = new Map(
    baseSymbols.flatMap((symbol) => {
      const key = toStableSymbolKey(symbol);
      return key ? [[key, symbol] as const] : [];
    }),
  );
  const headByKey = new Map(
    headSymbols.flatMap((symbol) => {
      const key = toStableSymbolKey(symbol);
      return key ? [[key, symbol] as const] : [];
    }),
  );

  const added = [...headByKey]
    .filter(([key]) => !baseByKey.has(key))
    .map(([, symbol]) => toSymbolDiffEntry(symbol, "added"));
  const removed = [...baseByKey]
    .filter(([key]) => !headByKey.has(key))
    .map(([, symbol]) => toSymbolDiffEntry(symbol, "removed"));

  return [...added, ...removed].sort(compareSymbolDiffEntries);
}

function toStableSymbolKey(symbol: ParsedRepoSymbol) {
  return symbol.stableSymbolKey ?? symbol.localSymbolKey;
}

function toSymbolDiffEntry(
  symbol: ParsedRepoSymbol,
  change: ProjectImportSymbolDiffEntry["change"],
): ProjectImportSymbolDiffEntry {
  return {
    filePath: symbol.file?.path ?? null,
    symbolName: symbol.displayName,
    kind: symbol.kind,
    change,
  };
}

function compareSymbolDiffEntries(
  left: ProjectImportSymbolDiffEntry,
  right: ProjectImportSymbolDiffEntry,
) {
  const fileComparison = (left.filePath ?? "").localeCompare(
    right.filePath ?? "",
  );
  if (fileComparison !== 0) return fileComparison;

  const nameComparison = left.symbolName.localeCompare(right.symbolName);
  if (nameComparison !== 0) return nameComparison;

  return left.change.localeCompare(right.change);
}

function compareEdges(
  baseEdges: ParsedRepoImportEdge[],
  headEdges: ParsedRepoImportEdge[],
) {
  const baseByKey = new Map(
    baseEdges.map((edge) => {
      const parsedEdge = toImportEdge(edge);
      return [toStableEdgeKey(parsedEdge), parsedEdge] as const;
    }),
  );
  const headByKey = new Map(
    headEdges.map((edge) => {
      const parsedEdge = toImportEdge(edge);
      return [toStableEdgeKey(parsedEdge), parsedEdge] as const;
    }),
  );

  const edges: ProjectImportEdgeDiffEntry[] = [];

  for (const [key, edge] of headByKey) {
    if (!baseByKey.has(key)) edges.push(toEdgeDiffEntry(edge, "added"));
  }

  for (const [key, edge] of baseByKey) {
    if (!headByKey.has(key)) edges.push(toEdgeDiffEntry(edge, "removed"));
  }

  return edges.sort(compareEdgeDiffEntries);
}

function toStableEdgeKey(edge: ParsedImportEdge) {
  return [
    edge.sourceFilePath,
    edge.targetFilePath ??
      edge.targetPathText ??
      edge.targetExternalSymbolKey ??
      edge.moduleSpecifier,
    edge.moduleSpecifier,
    edge.importKind,
    edge.importedNames.slice().sort().join(","),
    edge.isTypeOnly ? "type" : "value",
    edge.resolutionKind,
  ].join("\u0000");
}

function toEdgeDiffEntry(
  edge: ParsedImportEdge,
  change: ProjectImportEdgeDiffEntry["change"],
): ProjectImportEdgeDiffEntry {
  return {
    source: edge.sourceFilePath,
    target:
      edge.targetFilePath ??
      edge.targetPathText ??
      edge.targetExternalSymbolKey ??
      edge.moduleSpecifier,
    moduleSpecifier: edge.moduleSpecifier,
    importKind: edge.importKind,
    importedNames: edge.importedNames,
    isTypeOnly: edge.isTypeOnly,
    isResolved: edge.isResolved,
    resolutionKind: edge.resolutionKind,
    startLine: edge.startLine,
    startCol: edge.startCol,
    change,
  };
}

function compareEdgeDiffEntries(
  left: ProjectImportEdgeDiffEntry,
  right: ProjectImportEdgeDiffEntry,
) {
  const sourceComparison = left.source.localeCompare(right.source);
  if (sourceComparison !== 0) return sourceComparison;

  const targetComparison = left.target.localeCompare(right.target);
  if (targetComparison !== 0) return targetComparison;

  if (left.startLine !== right.startLine) return left.startLine - right.startLine;
  if (left.startCol !== right.startCol) return left.startCol - right.startCol;

  return left.change.localeCompare(right.change);
}
