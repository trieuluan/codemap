import { and, asc, eq } from "drizzle-orm";
import {
  repoFile,
  repoImportEdge,
  repoSymbol,
  repoSymbolOccurrence,
  repoSymbolRelationship,
} from "../../../../db/schema";
import type {
  RepoSymbolOccurrenceRole,
  RepoSymbolRelationshipKind,
} from "../../../../db/schema";
import type {
  ProjectSymbolCaller,
  ProjectSymbolOccurrenceUsage,
  ProjectSymbolUsageConfidence,
  ProjectSymbolUsageRange,
  ProjectSymbolUsagesResponse,
} from "../types/repo-parse-graph.types";
import { pickBestOccurrence } from "./utils";

type Database = typeof import("../../../../db/index.ts").db;

const DEFINITION_ROLES = new Set<RepoSymbolOccurrenceRole>([
  "definition",
  "declaration",
]);

const CALLER_RELATIONSHIP_KINDS = new Set<RepoSymbolRelationshipKind>([
  "calls",
  "references",
  "type_of",
  "implements",
  "extends",
  "overrides",
]);

function toRange(item: {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}): ProjectSymbolUsageRange {
  return {
    startLine: item.startLine,
    startCol: item.startCol + 1,
    endLine: item.endLine,
    endCol: item.endCol + 1,
  };
}

function confidenceForOccurrence(
  role: RepoSymbolOccurrenceRole,
): ProjectSymbolUsageConfidence {
  if (role === "reference" || role === "type_reference") return "definite";
  if (role === "import" || role === "export") return "probable";
  return "definite";
}

function callerKey(caller: ProjectSymbolCaller) {
  const range = caller.range;
  return [
    caller.fileId,
    caller.evidence,
    caller.relationshipKind ?? "",
    caller.moduleSpecifier ?? "",
    range?.startLine ?? "",
    range?.startCol ?? "",
  ].join(":");
}

export function createSymbolUsagesService(database: Database) {
  return {
    async getSymbolUsagesById(
      projectImportId: string,
      symbolId: string,
    ): Promise<ProjectSymbolUsagesResponse | null> {
      const symbol = await database.query.repoSymbol.findFirst({
        where: and(
          eq(repoSymbol.projectImportId, projectImportId),
          eq(repoSymbol.id, symbolId),
        ),
        with: { file: true, parentSymbol: true },
      });

      if (!symbol) return null;

      const [
        occurrences,
        incomingRelationships,
        incomingImports,
      ] = await Promise.all([
        database.query.repoSymbolOccurrence.findMany({
          where: and(
            eq(repoSymbolOccurrence.projectImportId, projectImportId),
            eq(repoSymbolOccurrence.symbolId, symbol.id),
          ),
          with: { file: true },
          orderBy: [
            asc(repoSymbolOccurrence.startLine),
            asc(repoSymbolOccurrence.startCol),
          ],
        }),
        database.query.repoSymbolRelationship.findMany({
          where: and(
            eq(repoSymbolRelationship.projectImportId, projectImportId),
            eq(repoSymbolRelationship.toSymbolId, symbol.id),
          ),
          with: { fromSymbol: { with: { file: true } } },
          orderBy: [asc(repoSymbolRelationship.relationshipKind)],
        }),
        symbol.fileId
          ? database.query.repoImportEdge.findMany({
              where: and(
                eq(repoImportEdge.projectImportId, projectImportId),
                eq(repoImportEdge.targetFileId, symbol.fileId),
                eq(repoImportEdge.isResolved, true),
              ),
              with: { sourceFile: true },
              orderBy: [asc(repoImportEdge.startLine), asc(repoImportEdge.startCol)],
            })
          : Promise.resolve([]),
      ]);

      const occurrenceUsages: ProjectSymbolOccurrenceUsage[] = occurrences
        .filter((item) => item.file)
        .map((item) => ({
          id: item.id,
          fileId: item.fileId,
          filePath: item.file.path,
          role: item.occurrenceRole,
          range: toRange(item),
          syntaxKind: item.syntaxKind,
          snippetPreview: item.snippetPreview,
          confidence: confidenceForOccurrence(item.occurrenceRole),
        }));

      const definitions = occurrenceUsages.filter((item) =>
        DEFINITION_ROLES.has(item.role),
      );
      const usages = occurrenceUsages.filter(
        (item) => !DEFINITION_ROLES.has(item.role),
      );

      const callers: ProjectSymbolCaller[] = [];

      for (const relationship of incomingRelationships) {
        if (!CALLER_RELATIONSHIP_KINDS.has(relationship.relationshipKind)) {
          continue;
        }

        const fromSymbol = relationship.fromSymbol;
        if (!fromSymbol?.file) continue;

        callers.push({
          fileId: fromSymbol.file.id,
          filePath: fromSymbol.file.path,
          evidence: "symbol_relationship",
          relationshipKind: relationship.relationshipKind,
          range: null,
          confidence: "definite",
        });
      }

      for (const edge of incomingImports) {
        if (!edge.sourceFile) continue;

        const importedNames = edge.importedNames ?? [];
        const hasNamedMatch = importedNames.some(
          (name) => name.toLowerCase() === symbol.displayName.toLowerCase(),
        );

        if (importedNames.length > 0 && !hasNamedMatch) {
          continue;
        }

        callers.push({
          fileId: edge.sourceFile.id,
          filePath: edge.sourceFile.path,
          evidence: hasNamedMatch
            ? "named_import"
            : "namespace_or_wildcard_import",
          importKind: edge.importKind,
          moduleSpecifier: edge.moduleSpecifier,
          importedNames,
          range: toRange(edge),
          confidence: hasNamedMatch ? "definite" : "potential",
        });
      }

      for (const usage of usages) {
        callers.push({
          fileId: usage.fileId,
          filePath: usage.filePath,
          evidence: "occurrence",
          occurrenceRole: usage.role,
          range: usage.range,
          confidence: usage.confidence,
          snippetPreview: usage.snippetPreview,
        });
      }

      const dedupedCallers = Array.from(
        new Map(callers.map((caller) => [callerKey(caller), caller])).values(),
      ).sort((left, right) => {
        const pathCompare = left.filePath.localeCompare(right.filePath);
        if (pathCompare !== 0) return pathCompare;
        return (left.range?.startLine ?? 0) - (right.range?.startLine ?? 0);
      });

      const bestOccurrence = pickBestOccurrence(
        occurrences.filter(
          (item): item is typeof item & { symbolId: string } =>
            Boolean(item.symbolId),
        ),
      ).get(symbol.id);

      return {
        target: {
          id: symbol.id,
          displayName: symbol.displayName,
          symbolKind: symbol.kind,
          signature: symbol.signature,
          fileId: symbol.fileId,
          filePath: symbol.file?.path ?? null,
          parentSymbolId: symbol.parentSymbolId,
          parentSymbolName: symbol.parentSymbol?.displayName ?? null,
          isExported: symbol.isExported,
          isDefaultExport: symbol.isDefaultExport,
          range: bestOccurrence ? toRange(bestOccurrence) : null,
        },
        definitions,
        usages,
        callers: dedupedCallers,
        totals: {
          definitions: definitions.length,
          usages: usages.length,
          callers: dedupedCallers.length,
        },
        meta: {
          projectImportId,
          source: "repo_parse_graph",
          staleness: "latest_import",
        },
      };
    },

    async findSymbolUsages(
      projectImportId: string,
      options: { symbolName: string; filePath?: string },
    ): Promise<ProjectSymbolUsagesResponse | null> {
      let fileId: string | undefined;

      if (options.filePath) {
        const file = await database.query.repoFile.findFirst({
          where: and(
            eq(repoFile.projectImportId, projectImportId),
            eq(repoFile.path, options.filePath),
          ),
          columns: { id: true },
        });

        if (!file) return null;
        fileId = file.id;
      }

      const symbol = await database.query.repoSymbol.findFirst({
        where: and(
          eq(repoSymbol.projectImportId, projectImportId),
          eq(repoSymbol.displayName, options.symbolName),
          fileId ? eq(repoSymbol.fileId, fileId) : undefined,
        ),
        orderBy: [asc(repoSymbol.displayName)],
      });

      if (!symbol) return null;
      return this.getSymbolUsagesById(projectImportId, symbol.id);
    },
  };
}
