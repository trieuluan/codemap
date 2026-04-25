import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  repoExport,
  repoFile,
  repoImportEdge,
  repoSymbol,
  repoSymbolOccurrence,
  repoSymbolRelationship,
} from "../../../../db/schema";
import type {
  RepoSymbolKind,
  RepoSymbolOccurrenceRole,
} from "../../../../db/schema/repo-parse-schema";
import type {
  ProjectExportRecord,
  ProjectFileAnalysis,
  ProjectFileBlastRadius,
  ProjectFileSymbolRecord,
  ProjectInsightsCycleCandidate,
  ProjectSymbol,
  ProjectSymbolRelationshipRecord,
} from "../types/repo-parse-graph.types";
import { pickBestOccurrence, tarjanSCC } from "./utils";

type Database = typeof import("../../../../db/index.ts").db;

export function createFileQueryService(database: Database) {
  return {
    async listFiles(
      projectImportId: string,
      options?: { language?: string; includeIgnored?: boolean },
    ) {
      const filters = [eq(repoFile.projectImportId, projectImportId)];

      if (options?.language) {
        filters.push(eq(repoFile.language, options.language));
      }

      if (!options?.includeIgnored) {
        filters.push(eq(repoFile.isIgnored, false));
      }

      return database.query.repoFile.findMany({
        where: and(...filters),
        orderBy: [asc(repoFile.path)],
      });
    },

    async getFileByPath(projectImportId: string, filePath: string) {
      return database.query.repoFile.findFirst({
        where: and(
          eq(repoFile.projectImportId, projectImportId),
          eq(repoFile.path, filePath),
        ),
      });
    },

    async listSymbols(
      projectImportId: string,
      options?: { fileId?: string; kind?: RepoSymbolKind },
    ): Promise<ProjectSymbol[]> {
      const filters = [eq(repoSymbol.projectImportId, projectImportId)];

      if (options?.fileId) filters.push(eq(repoSymbol.fileId, options.fileId));
      if (options?.kind) filters.push(eq(repoSymbol.kind, options.kind));

      const symbols = await database.query.repoSymbol.findMany({
        where: and(...filters),
        with: { file: true, parentSymbol: true },
        orderBy: [asc(repoSymbol.fileId), asc(repoSymbol.displayName)],
      });

      return symbols.map((symbol) => ({
        id: symbol.id,
        projectImportId: symbol.projectImportId,
        fileId: symbol.fileId,
        filePath: symbol.file?.path ?? null,
        stableSymbolKey: symbol.stableSymbolKey,
        localSymbolKey: symbol.localSymbolKey,
        displayName: symbol.displayName,
        kind: symbol.kind,
        language: symbol.language,
        visibility: symbol.visibility,
        isExported: symbol.isExported,
        isDefaultExport: symbol.isDefaultExport,
        signature: symbol.signature,
        returnType: symbol.returnType,
        parentSymbolId: symbol.parentSymbolId,
        parentSymbolName: symbol.parentSymbol?.displayName ?? null,
        ownerSymbolKey: symbol.ownerSymbolKey,
        docJson: symbol.docJson,
        typeJson: symbol.typeJson,
        modifiersJson: symbol.modifiersJson,
        extraJson: symbol.extraJson,
        createdAt: symbol.createdAt,
        updatedAt: symbol.updatedAt,
      }));
    },

    async listFileSymbols(
      projectImportId: string,
      fileId: string,
    ): Promise<ProjectFileSymbolRecord[]> {
      const [symbols, occurrences, relationships] = await Promise.all([
        database.query.repoSymbol.findMany({
          where: and(
            eq(repoSymbol.projectImportId, projectImportId),
            eq(repoSymbol.fileId, fileId),
          ),
          with: { parentSymbol: true },
          orderBy: [asc(repoSymbol.displayName)],
        }),
        database.query.repoSymbolOccurrence.findMany({
          where: and(
            eq(repoSymbolOccurrence.projectImportId, projectImportId),
            eq(repoSymbolOccurrence.fileId, fileId),
          ),
          orderBy: [asc(repoSymbolOccurrence.startLine), asc(repoSymbolOccurrence.startCol)],
        }),
        database.query.repoSymbolRelationship.findMany({
          where: and(
            eq(repoSymbolRelationship.projectImportId, projectImportId),
            inArray(
              repoSymbolRelationship.fromSymbolId,
              database
                .select({ id: repoSymbol.id })
                .from(repoSymbol)
                .where(and(
                  eq(repoSymbol.projectImportId, projectImportId),
                  eq(repoSymbol.fileId, fileId),
                )),
            ),
          ),
        }),
      ]);

      const relationshipsBySymbolId = new Map<string, { kind: string; targetName: string }[]>();
      for (const rel of relationships) {
        const arr = relationshipsBySymbolId.get(rel.fromSymbolId) ?? [];
        arr.push({ kind: rel.relationshipKind, targetName: rel.toExternalSymbolKey ?? "" });
        relationshipsBySymbolId.set(rel.fromSymbolId, arr);
      }

      const occurrenceBySymbolId = pickBestOccurrence(
        occurrences.filter((o): o is typeof o & { symbolId: string } => Boolean(o.symbolId)) as Array<typeof occurrences[number] & { symbolId: string; occurrenceRole: RepoSymbolOccurrenceRole }>,
      );

      return symbols
        .map((symbol) => {
          const occurrence = occurrenceBySymbolId.get(symbol.id);

          return {
            id: symbol.id,
            displayName: symbol.displayName,
            kind: symbol.kind,
            signature: symbol.signature,
            returnType: symbol.returnType,
            doc: symbol.docJson && typeof symbol.docJson === "object" && "text" in symbol.docJson
              ? (symbol.docJson as { text: string }).text
              : null,
            heritage: relationshipsBySymbolId.get(symbol.id) ?? [],
            isExported: symbol.isExported,
            parentSymbolName: symbol.parentSymbol?.displayName ?? null,
            startLine: occurrence?.startLine ?? null,
            startCol: occurrence?.startCol ?? null,
            endLine: occurrence?.endLine ?? null,
            endCol: occurrence?.endCol ?? null,
          };
        })
        .sort((left, right) => {
          if (left.startLine === null && right.startLine === null) {
            return left.displayName.localeCompare(right.displayName);
          }
          if (left.startLine === null) return 1;
          if (right.startLine === null) return -1;
          if (left.startLine !== right.startLine) return left.startLine - right.startLine;
          return (left.startCol ?? 0) - (right.startCol ?? 0);
        });
    },

    async listExports(
      projectImportId: string,
      fileId: string,
    ): Promise<ProjectExportRecord[]> {
      const exportsForFile = await database.query.repoExport.findMany({
        where: and(
          eq(repoExport.projectImportId, projectImportId),
          eq(repoExport.fileId, fileId),
        ),
        with: { file: true, symbol: true, sourceImportEdge: true },
        orderBy: [asc(repoExport.startLine), asc(repoExport.startCol)],
      });

      return exportsForFile.map((item) => ({
        id: item.id,
        projectImportId: item.projectImportId,
        fileId: item.fileId,
        filePath: item.file.path,
        symbolId: item.symbolId,
        symbolDisplayName: item.symbol?.displayName ?? null,
        exportName: item.exportName,
        exportKind: item.exportKind,
        sourceImportEdgeId: item.sourceImportEdgeId,
        sourceModuleSpecifier: item.sourceImportEdge?.moduleSpecifier ?? null,
        targetExternalSymbolKey: item.targetExternalSymbolKey,
        startLine: item.startLine,
        startCol: item.startCol,
        endLine: item.endLine,
        endCol: item.endCol,
        extraJson: item.extraJson,
        createdAt: item.createdAt,
      }));
    },

    async listRelationshipsForSymbol(
      projectImportId: string,
      symbolId: string,
      options?: {
        onlyImplementations?: boolean;
        onlyReferences?: boolean;
        onlyTypeDefinitions?: boolean;
      },
    ): Promise<ProjectSymbolRelationshipRecord[]> {
      const filters = [
        eq(repoSymbolRelationship.projectImportId, projectImportId),
        eq(repoSymbolRelationship.fromSymbolId, symbolId),
      ];

      if (options?.onlyImplementations) filters.push(eq(repoSymbolRelationship.isImplementation, true));
      if (options?.onlyReferences) filters.push(eq(repoSymbolRelationship.isReference, true));
      if (options?.onlyTypeDefinitions) filters.push(eq(repoSymbolRelationship.isTypeDefinition, true));

      const relationships = await database.query.repoSymbolRelationship.findMany({
        where: and(...filters),
        with: { fromSymbol: true, toSymbol: true },
        orderBy: [desc(repoSymbolRelationship.createdAt)],
      });

      return relationships.map((relationship) => ({
        id: relationship.id,
        projectImportId: relationship.projectImportId,
        fromSymbolId: relationship.fromSymbolId,
        fromSymbolName: relationship.fromSymbol.displayName,
        toSymbolId: relationship.toSymbolId,
        toSymbolName: relationship.toSymbol?.displayName ?? null,
        toExternalSymbolKey: relationship.toExternalSymbolKey,
        relationshipKind: relationship.relationshipKind,
        isReference: relationship.isReference,
        isImplementation: relationship.isImplementation,
        isTypeDefinition: relationship.isTypeDefinition,
        isDefinition: relationship.isDefinition,
        extraJson: relationship.extraJson,
        createdAt: relationship.createdAt,
      }));
    },

    async getFileAnalysis(
      projectImportId: string,
      fileId: string,
    ): Promise<ProjectFileAnalysis> {
      const [files, edges] = await Promise.all([
        database.query.repoFile.findMany({
          where: and(eq(repoFile.projectImportId, projectImportId), eq(repoFile.isIgnored, false)),
          orderBy: [asc(repoFile.path)],
        }),
        database.query.repoImportEdge.findMany({
          where: and(eq(repoImportEdge.projectImportId, projectImportId), eq(repoImportEdge.isResolved, true)),
        }),
      ]);

      const fileStats = new Map<string, { path: string; language: string | null; incomingCount: number; outgoingCount: number }>();
      const forwardAdjacency = new Map<string, Set<string>>();
      const reverseAdjacency = new Map<string, Set<string>>();
      const edgeCounts = new Map<string, number>();

      for (const file of files) {
        fileStats.set(file.id, { path: file.path, language: file.language, incomingCount: 0, outgoingCount: 0 });
      }

      for (const edge of edges) {
        if (!edge.targetFileId) continue;
        const source = fileStats.get(edge.sourceFileId);
        const target = fileStats.get(edge.targetFileId);
        if (!source || !target) continue;

        source.outgoingCount += 1;
        target.incomingCount += 1;

        const fwd = forwardAdjacency.get(edge.sourceFileId) ?? new Set<string>();
        fwd.add(edge.targetFileId);
        forwardAdjacency.set(edge.sourceFileId, fwd);

        const rev = reverseAdjacency.get(edge.targetFileId) ?? new Set<string>();
        rev.add(edge.sourceFileId);
        reverseAdjacency.set(edge.targetFileId, rev);

        const key = `${edge.sourceFileId}->${edge.targetFileId}`;
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
      }

      // Blast radius via reverse BFS
      const directDependents = reverseAdjacency.get(fileId) ?? new Set<string>();
      const visited = new Set<string>();
      const queue = Array.from(directDependents).map((dependentId) => ({ fileId: dependentId, depth: 1 }));
      let hasCycles = false;
      let maxDepth = 0;

      for (let i = 0; i < queue.length; i += 1) {
        const current = queue[i];
        if (current.fileId === fileId) { hasCycles = true; continue; }
        if (visited.has(current.fileId)) { hasCycles = true; continue; }

        visited.add(current.fileId);
        maxDepth = Math.max(maxDepth, current.depth);

        for (const nextId of reverseAdjacency.get(current.fileId) ?? []) {
          queue.push({ fileId: nextId, depth: current.depth + 1 });
        }
      }

      const depthByFileId = new Map<string, number>();
      for (const item of queue) {
        if (item.fileId === fileId || !visited.has(item.fileId)) continue;
        const cur = depthByFileId.get(item.fileId);
        if (cur === undefined || item.depth < cur) depthByFileId.set(item.fileId, item.depth);
      }

      const impactedFiles = Array.from(depthByFileId.entries())
        .map(([impactedId, depth]) => {
          const stats = fileStats.get(impactedId);
          if (!stats) return null;
          return { path: stats.path, language: stats.language, depth, incomingCount: stats.incomingCount, outgoingCount: stats.outgoingCount };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((a, b) => a.depth !== b.depth ? a.depth - b.depth : a.path.localeCompare(b.path));

      const blastRadius: ProjectFileBlastRadius = {
        totalCount: impactedFiles.length,
        directCount: directDependents.size,
        maxDepth,
        hasCycles,
        files: impactedFiles.slice(0, 25),
      };

      // Cycles via Tarjan SCC (filtered to fileId)
      const cycleCandidates: ProjectInsightsCycleCandidate[] = [];
      const seenDirectKeys = new Set<string>();

      for (const targetId of forwardAdjacency.get(fileId) ?? []) {
        if (!forwardAdjacency.get(targetId)?.has(fileId)) continue;

        const sourcePath = fileStats.get(fileId)?.path;
        const targetPath = fileStats.get(targetId)?.path;
        if (!sourcePath || !targetPath) continue;

        const sortedPaths = [sourcePath, targetPath].sort((a, b) => a.localeCompare(b));
        const key = sortedPaths.join("::");
        if (seenDirectKeys.has(key)) continue;
        seenDirectKeys.add(key);

        cycleCandidates.push({
          kind: "direct",
          paths: sortedPaths,
          edgeCount: (edgeCounts.get(`${fileId}->${targetId}`) ?? 1) + (edgeCounts.get(`${targetId}->${fileId}`) ?? 1),
          summary: `${sortedPaths[0]} and ${sortedPaths[1]} import each other`,
        });
      }

      const sccs = tarjanSCC(Array.from(fileStats.keys()), forwardAdjacency);
      for (const component of sccs) {
        if (component.length < 3 || !component.includes(fileId)) continue;

        const paths = component
          .map((id) => fileStats.get(id)?.path)
          .filter((p): p is string => Boolean(p))
          .sort((a, b) => a.localeCompare(b));

        const componentSet = new Set(component);
        let edgeCount = 0;
        for (const fid of component) {
          for (const nid of forwardAdjacency.get(fid) ?? []) {
            if (componentSet.has(nid)) edgeCount += 1;
          }
        }

        cycleCandidates.push({ kind: "scc", paths, edgeCount, summary: `${paths.length}-file dependency cycle` });
      }

      return { blastRadius, cycles: cycleCandidates };
    },
  };
}
