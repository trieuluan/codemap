import { and, asc, eq, inArray } from "drizzle-orm";
import {
  repoFile,
  repoSymbol,
  repoSymbolOccurrence,
  repoSymbolRelationship,
} from "../../../../db/schema";
import type { ProjectSymbolGraphResponse } from "@codemap/shared";

type Database = typeof import("../../../../db/index.ts").db;
type SymbolRecord = typeof repoSymbol.$inferSelect & {
  file?: typeof repoFile.$inferSelect | null;
  parentSymbol?: typeof repoSymbol.$inferSelect | null;
};

const DEFINITION_ROLES = new Set(["definition", "declaration"]);

function toRange(item: {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}) {
  return {
    startLine: item.startLine,
    startCol: item.startCol + 1,
    endLine: item.endLine,
    endCol: item.endCol + 1,
  };
}

function emptyResponse(
  projectImportId: string,
  file: ProjectSymbolGraphResponse["file"],
): ProjectSymbolGraphResponse {
  return {
    file,
    symbols: [],
    target: null,
    nodes: [],
    edges: [],
    meta: {
      projectImportId,
      source: "repo_parse_graph",
      staleness: "latest_import",
    },
  };
}

function confidenceForKind(kind: string) {
  if (kind === "calls" || kind === "references") return "definite" as const;
  if (kind === "imports_from" || kind === "exports_from") return "probable" as const;
  return "definite" as const;
}

function confidenceForOccurrence(role: string) {
  if (role === "reference" || role === "type_reference") return "definite" as const;
  if (role === "import" || role === "export") return "probable" as const;
  return "definite" as const;
}

export function createSymbolGraphService(database: Database) {
  return {
    async getProjectSymbolGraph(
      projectImportId: string,
      options: { filePath: string; symbolName?: string },
    ): Promise<ProjectSymbolGraphResponse> {
      const file = await database.query.repoFile.findFirst({
        where: and(
          eq(repoFile.projectImportId, projectImportId),
          eq(repoFile.path, options.filePath),
        ),
      });

      if (!file) return emptyResponse(projectImportId, null);

      const fileInfo = {
        id: file.id,
        path: file.path,
        language: file.language,
      };

      const symbols = await database.query.repoSymbol.findMany({
        where: and(
          eq(repoSymbol.projectImportId, projectImportId),
          eq(repoSymbol.fileId, file.id),
        ),
        with: { parentSymbol: true },
        orderBy: [asc(repoSymbol.displayName)],
      });

      if (symbols.length === 0) return emptyResponse(projectImportId, fileInfo);

      const symbolIds = symbols.map((symbol) => symbol.id);
      const [occurrences, incomingRelationships, outgoingRelationships] =
        await Promise.all([
          database.query.repoSymbolOccurrence.findMany({
            where: and(
              eq(repoSymbolOccurrence.projectImportId, projectImportId),
              inArray(repoSymbolOccurrence.symbolId, symbolIds),
            ),
            orderBy: [
              asc(repoSymbolOccurrence.startLine),
              asc(repoSymbolOccurrence.startCol),
            ],
          }),
          database.query.repoSymbolRelationship.findMany({
            where: and(
              eq(repoSymbolRelationship.projectImportId, projectImportId),
              inArray(repoSymbolRelationship.toSymbolId, symbolIds),
            ),
            with: { fromSymbol: { with: { file: true } } },
          }),
          database.query.repoSymbolRelationship.findMany({
            where: and(
              eq(repoSymbolRelationship.projectImportId, projectImportId),
              inArray(repoSymbolRelationship.fromSymbolId, symbolIds),
            ),
            with: { toSymbol: { with: { file: true } } },
          }),
        ]);

      const occurrenceBySymbolId = new Map<
        string,
        typeof occurrences
      >();
      for (const occurrence of occurrences) {
        if (!occurrence.symbolId) continue;
        const bucket = occurrenceBySymbolId.get(occurrence.symbolId) ?? [];
        bucket.push(occurrence);
        occurrenceBySymbolId.set(occurrence.symbolId, bucket);
      }

      const incomingCountBySymbolId = new Map<string, number>();
      const outgoingCountBySymbolId = new Map<string, number>();
      for (const relationship of incomingRelationships) {
        if (!relationship.toSymbolId) continue;
        incomingCountBySymbolId.set(
          relationship.toSymbolId,
          (incomingCountBySymbolId.get(relationship.toSymbolId) ?? 0) + 1,
        );
      }
      for (const relationship of outgoingRelationships) {
        outgoingCountBySymbolId.set(
          relationship.fromSymbolId,
          (outgoingCountBySymbolId.get(relationship.fromSymbolId) ?? 0) + 1,
        );
      }

      const toSummary = (symbol: SymbolRecord) => {
        const symbolOccurrences = occurrenceBySymbolId.get(symbol.id) ?? [];
        const definition = symbolOccurrences.find((item) =>
          DEFINITION_ROLES.has(item.occurrenceRole),
        );
        const usageCount = symbolOccurrences.filter(
          (item) => !DEFINITION_ROLES.has(item.occurrenceRole),
        ).length;
        const incomingCount = incomingCountBySymbolId.get(symbol.id) ?? 0;

        return {
          id: symbol.id,
          name: symbol.displayName,
          kind: symbol.kind,
          signature: symbol.signature,
          fileId: symbol.fileId,
          filePath: symbol.file?.path ?? file.path,
          parentSymbolId: symbol.parentSymbolId,
          parentSymbolName: symbol.parentSymbol?.displayName ?? null,
          isExported: symbol.isExported,
          isDefaultExport: symbol.isDefaultExport,
          range: definition ? toRange(definition) : null,
          usageCount,
          callerCount: incomingCount + usageCount,
          outgoingCount: outgoingCountBySymbolId.get(symbol.id) ?? 0,
          incomingCount,
        };
      };

      const summaries = symbols.map(toSummary);
      const targetSummary = options.symbolName
        ? summaries.find((symbol) => symbol.name === options.symbolName) ?? null
        : null;

      if (!targetSummary) {
        return {
          ...emptyResponse(projectImportId, fileInfo),
          symbols: summaries,
        };
      }

      const target = symbols.find((symbol) => symbol.id === targetSummary.id)!;
      const targetOccurrences = occurrenceBySymbolId.get(target.id) ?? [];
      const targetIncomingRelationships = await database.query.repoSymbolRelationship.findMany({
        where: and(
          eq(repoSymbolRelationship.projectImportId, projectImportId),
          eq(repoSymbolRelationship.toSymbolId, target.id),
        ),
        with: { fromSymbol: { with: { file: true } } },
      });
      const targetOutgoingRelationships = await database.query.repoSymbolRelationship.findMany({
        where: and(
          eq(repoSymbolRelationship.projectImportId, projectImportId),
          eq(repoSymbolRelationship.fromSymbolId, target.id),
        ),
        with: { toSymbol: { with: { file: true } } },
      });

      const relatedSymbols = new Map<string, ProjectSymbolGraphResponse["nodes"][number]>();
      const targetNode = {
        id: target.id,
        name: target.displayName,
        kind: target.kind,
        signature: target.signature,
        filePath: file.path,
        range: targetSummary.range,
        role: "target" as const,
        confidence: "definite" as const,
      };
      relatedSymbols.set(targetNode.id, targetNode);

      const edges: ProjectSymbolGraphResponse["edges"] = [];
      for (const relationship of targetIncomingRelationships) {
        const source = relationship.fromSymbol;
        if (!source) continue;
        relatedSymbols.set(source.id, {
          id: source.id,
          name: source.displayName,
          kind: source.kind,
          signature: source.signature,
          filePath: source.file?.path ?? null,
          range: null,
          role: "incoming",
          confidence: confidenceForKind(relationship.relationshipKind),
        });
        edges.push({
          id: relationship.id,
          source: source.id,
          target: target.id,
          kind: relationship.relationshipKind,
          evidence: "symbol_relationship",
          confidence: confidenceForKind(relationship.relationshipKind),
          range: null,
        });
      }

      for (const relationship of targetOutgoingRelationships) {
        const destination = relationship.toSymbol;
        if (!destination) continue;
        relatedSymbols.set(destination.id, {
          id: destination.id,
          name: destination.displayName,
          kind: destination.kind,
          signature: destination.signature,
          filePath: destination.file?.path ?? null,
          range: null,
          role: "outgoing",
          confidence: confidenceForKind(relationship.relationshipKind),
        });
        edges.push({
          id: relationship.id,
          source: target.id,
          target: destination.id,
          kind: relationship.relationshipKind,
          evidence: "symbol_relationship",
          confidence: confidenceForKind(relationship.relationshipKind),
          range: null,
        });
      }

      for (const occurrence of targetOccurrences) {
        if (DEFINITION_ROLES.has(occurrence.occurrenceRole)) continue;
        const occurrenceId = `occurrence:${occurrence.id}`;
        relatedSymbols.set(occurrenceId, {
          id: occurrenceId,
          name: occurrence.occurrenceRole.replace(/_/g, " "),
          kind: "occurrence",
          signature: occurrence.snippetPreview,
          filePath: file.path,
          range: toRange(occurrence),
          role: "incoming",
          confidence: confidenceForOccurrence(occurrence.occurrenceRole),
        });
        edges.push({
          id: `occurrence-edge:${occurrence.id}`,
          source: occurrenceId,
          target: target.id,
          kind: occurrence.occurrenceRole,
          evidence: "occurrence",
          confidence: confidenceForOccurrence(occurrence.occurrenceRole),
          range: toRange(occurrence),
        });
      }

      return {
        file: fileInfo,
        symbols: summaries,
        target: targetSummary,
        nodes: Array.from(relatedSymbols.values()),
        edges,
        meta: {
          projectImportId,
          source: "repo_parse_graph",
          staleness: "latest_import",
        },
      };
    },
  };
}
