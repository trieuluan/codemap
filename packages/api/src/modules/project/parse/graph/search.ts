import { and, asc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import { repoExport, repoFile, repoSymbol, repoSymbolOccurrence } from "../../../../db/schema";
import type { RepoSymbolKind } from "../../../../db/schema/repo-parse-schema";
import type { ProjectMapSearchResponse } from "../types/repo-parse-graph.types";
import { pickBestOccurrence } from "./utils";

type Database = typeof import("../../../../db/index.ts").db;

function isSubsequenceMatch(value: string, query: string): boolean {
  let qi = 0;
  for (let vi = 0; vi < value.length && qi < query.length; vi++) {
    if (value[vi] === query[qi]) qi++;
  }
  return qi === query.length;
}

function compactSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function basenameWithoutExtension(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.[^.]+$/, "");
}

function splitQueryTokens(query: string): string[] {
  const tokens = new Set<string>();
  tokens.add(query);
  const words = query
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[\s_\-./]+/)
    .filter((w) => w.length >= 2);
  for (const w of words) tokens.add(w);
  return Array.from(tokens);
}

function getSearchRank(value: string, query: string, trgmScore = 0) {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  const valueBaseName = basenameWithoutExtension(normalizedValue);
  const compactValue = compactSearchText(normalizedValue);
  const compactBaseName = compactSearchText(valueBaseName);
  const compactQuery = compactSearchText(normalizedQuery);

  if (!normalizedValue || !normalizedQuery) return Number.MAX_SAFE_INTEGER;
  if (normalizedValue === normalizedQuery) return 0;
  if (valueBaseName === normalizedQuery) return 1;
  if (compactBaseName && compactBaseName === compactQuery) return 2;
  if (normalizedValue.startsWith(normalizedQuery)) return 3;
  if (valueBaseName.startsWith(normalizedQuery)) return 4;
  if (normalizedValue.includes(normalizedQuery)) return 5;
  if (compactQuery && compactValue.includes(compactQuery)) return 6;
  if (isSubsequenceMatch(normalizedValue, normalizedQuery)) return 7;
  if (trgmScore > 0) return 8 + (1 - trgmScore);

  return Number.MAX_SAFE_INTEGER;
}

export function createSearchService(database: Database) {
  return {
    async searchProjectMap(
      projectImportId: string,
      query: string,
      symbolKinds?: RepoSymbolKind[],
    ): Promise<ProjectMapSearchResponse> {
      const normalizedQuery = query.trim().toLowerCase();

      if (normalizedQuery.length < 2) {
        return { files: [], symbols: [], exports: [] };
      }

      const queryTokens = splitQueryTokens(query.trim());
      const tokenPatterns = queryTokens.map((t) => `%${t.toLowerCase()}%`);
      const exactPattern = `%${normalizedQuery}%`;

      const fileTokenFilter = or(...tokenPatterns.map((p) => ilike(repoFile.path, p)))!;
      const symbolTokenFilter = or(...tokenPatterns.map((p) => ilike(repoSymbol.displayName, p)))!;
      const exportTokenFilter = or(...tokenPatterns.map((p) => ilike(repoExport.exportName, p)))!;

      const trgmThreshold = 0.1;
      const fileTrgmFilter = gt(sql<number>`word_similarity(${normalizedQuery}, lower(${repoFile.path}))`, trgmThreshold);
      const symbolTrgmFilter = gt(sql<number>`word_similarity(${normalizedQuery}, lower(${repoSymbol.displayName}))`, trgmThreshold);
      const exportTrgmFilter = gt(sql<number>`word_similarity(${normalizedQuery}, lower(${repoExport.exportName}))`, trgmThreshold);
      const fileSearchOrder = sql<number>`case
        when lower(${repoFile.path}) = ${normalizedQuery} then 0
        when lower(${repoFile.path}) like ${exactPattern} then 1
        when word_similarity(${normalizedQuery}, lower(${repoFile.path})) > ${trgmThreshold} then 2
        else 3
      end`;
      const symbolSearchOrder = sql<number>`case
        when lower(${repoSymbol.displayName}) = ${normalizedQuery} then 0
        when lower(${repoSymbol.displayName}) like ${exactPattern} then 1
        when word_similarity(${normalizedQuery}, lower(${repoSymbol.displayName})) > ${trgmThreshold} then 2
        else 3
      end`;
      const exportSearchOrder = sql<number>`case
        when lower(${repoExport.exportName}) = ${normalizedQuery} then 0
        when lower(${repoExport.exportName}) like ${exactPattern} then 1
        when word_similarity(${normalizedQuery}, lower(${repoExport.exportName})) > ${trgmThreshold} then 2
        else 3
      end`;

      const [fileMatches, symbolMatches, exportMatches] = await Promise.all([
        database
          .select({
            id: repoFile.id,
            path: repoFile.path,
            language: repoFile.language,
            trgmScore: sql<number>`word_similarity(${normalizedQuery}, lower(${repoFile.path}))`,
          })
          .from(repoFile)
          .where(and(eq(repoFile.projectImportId, projectImportId), or(fileTokenFilter, fileTrgmFilter)))
          .orderBy(fileSearchOrder, asc(repoFile.path))
          .limit(100),
        database
          .select({
            id: repoSymbol.id,
            fileId: repoSymbol.fileId,
            displayName: repoSymbol.displayName,
            kind: repoSymbol.kind,
            signature: repoSymbol.signature,
            parentSymbolId: repoSymbol.parentSymbolId,
            trgmScore: sql<number>`word_similarity(${normalizedQuery}, lower(${repoSymbol.displayName}))`,
          })
          .from(repoSymbol)
          .where(and(
            eq(repoSymbol.projectImportId, projectImportId),
            or(symbolTokenFilter, symbolTrgmFilter),
            symbolKinds && symbolKinds.length > 0 ? inArray(repoSymbol.kind, symbolKinds) : undefined,
          ))
          .orderBy(symbolSearchOrder, asc(repoSymbol.displayName))
          .limit(100),
        database
          .select({
            id: repoExport.id,
            fileId: repoExport.fileId,
            symbolId: repoExport.symbolId,
            exportName: repoExport.exportName,
            startLine: repoExport.startLine,
            startCol: repoExport.startCol,
            endLine: repoExport.endLine,
            endCol: repoExport.endCol,
            trgmScore: sql<number>`word_similarity(${normalizedQuery}, lower(${repoExport.exportName}))`,
          })
          .from(repoExport)
          .where(and(eq(repoExport.projectImportId, projectImportId), or(exportTokenFilter, exportTrgmFilter)))
          .orderBy(exportSearchOrder, asc(repoExport.exportName))
          .limit(100),
      ]);

      const allSymbolIds = [...new Set([
        ...symbolMatches.map((s) => s.id),
        ...exportMatches.map((e) => e.symbolId).filter((id): id is string => Boolean(id)),
      ])];

      const allFileIds = [...new Set([
        ...symbolMatches.map((s) => s.fileId).filter(Boolean),
        ...exportMatches.map((e) => e.fileId),
      ])] as string[];

      const allParentSymbolIds = symbolMatches
        .map((s) => s.parentSymbolId)
        .filter((id): id is string => Boolean(id));

      const [occurrences, fileRecords, parentSymbolRecords] = await Promise.all([
        allSymbolIds.length > 0
          ? database.query.repoSymbolOccurrence.findMany({
              where: and(
                eq(repoSymbolOccurrence.projectImportId, projectImportId),
                inArray(repoSymbolOccurrence.symbolId, allSymbolIds),
              ),
              orderBy: [asc(repoSymbolOccurrence.startLine), asc(repoSymbolOccurrence.startCol)],
            })
          : Promise.resolve([]),
        allFileIds.length > 0
          ? database.query.repoFile.findMany({ where: inArray(repoFile.id, allFileIds), columns: { id: true, path: true } })
          : Promise.resolve([]),
        allParentSymbolIds.length > 0
          ? database.query.repoSymbol.findMany({ where: inArray(repoSymbol.id, allParentSymbolIds), columns: { id: true, displayName: true } })
          : Promise.resolve([]),
      ]);

      const fileById = new Map(fileRecords.map((f) => [f.id, f]));
      const parentSymbolById = new Map(parentSymbolRecords.map((s) => [s.id, s]));
      const bestOccurrenceBySymbolId = pickBestOccurrence(
        occurrences.filter((o): o is typeof o & { symbolId: string } => Boolean(o.symbolId)),
      );

      const files = fileMatches
        .map((file) => ({ kind: "file" as const, path: file.path, language: file.language, rank: getSearchRank(file.path, normalizedQuery, file.trgmScore) }))
        .filter((item) => item.rank !== Number.MAX_SAFE_INTEGER)
        .sort((left, right) => left.rank !== right.rank ? left.rank - right.rank : left.path.localeCompare(right.path))
        .slice(0, 12)
        .map(({ rank: _rank, ...item }) => item);

      const symbols = symbolMatches
        .map((symbol) => {
          const filePath = symbol.fileId ? fileById.get(symbol.fileId)?.path ?? "" : "";
          const occurrence = bestOccurrenceBySymbolId.get(symbol.id);
          const parentSymbolName = symbol.parentSymbolId ? parentSymbolById.get(symbol.parentSymbolId)?.displayName ?? null : null;

          return {
            kind: "symbol" as const,
            id: symbol.id,
            displayName: symbol.displayName,
            symbolKind: symbol.kind,
            signature: symbol.signature ?? null,
            filePath,
            parentSymbolName,
            startLine: occurrence?.startLine ?? null,
            startCol: occurrence?.startCol ?? null,
            endLine: occurrence?.endLine ?? null,
            endCol: occurrence?.endCol ?? null,
            rank: getSearchRank(symbol.displayName, normalizedQuery, symbol.trgmScore),
          };
        })
        .filter((item) => item.rank !== Number.MAX_SAFE_INTEGER && item.filePath)
        .sort((left, right) => {
          if (left.rank !== right.rank) return left.rank - right.rank;
          const cmp = left.displayName.localeCompare(right.displayName);
          if (cmp !== 0) return cmp;
          return left.filePath.localeCompare(right.filePath);
        })
        .slice(0, 12)
        .map(({ rank: _rank, ...item }) => item);

      const exports = exportMatches
        .map((item) => {
          const filePath = fileById.get(item.fileId)?.path ?? "";
          const occurrence = item.symbolId ? bestOccurrenceBySymbolId.get(item.symbolId) : null;

          return {
            kind: "export" as const,
            id: item.id,
            exportName: item.exportName,
            filePath,
            symbolId: item.symbolId,
            symbolStartLine: occurrence?.startLine ?? null,
            symbolStartCol: occurrence?.startCol ?? null,
            symbolEndLine: occurrence?.endLine ?? null,
            symbolEndCol: occurrence?.endCol ?? null,
            startLine: item.startLine,
            startCol: item.startCol,
            endLine: item.endLine,
            endCol: item.endCol,
            rank: getSearchRank(item.exportName, normalizedQuery, item.trgmScore),
          };
        })
        .filter((item) => item.rank !== Number.MAX_SAFE_INTEGER)
        .sort((left, right) => {
          if (left.rank !== right.rank) return left.rank - right.rank;
          const cmp = left.exportName.localeCompare(right.exportName);
          if (cmp !== 0) return cmp;
          return left.filePath.localeCompare(right.filePath);
        })
        .slice(0, 12)
        .map(({ rank: _rank, ...item }) => item);

      return { files, symbols, exports };
    },
  };
}
