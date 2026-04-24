import { and, asc, desc, eq, ilike, inArray } from "drizzle-orm";
import {
  projectImport,
  repoExport,
  repoExternalSymbol,
  repoFile,
  repoImportEdge,
  repoParseIssue,
  repoSymbol,
  repoSymbolOccurrence,
  repoSymbolRelationship,
  type ProjectFileRecord,
  type RepoExternalSymbolInsert,
  type RepoExportInsert,
  type RepoFileInsert,
  type RepoImportEdgeInsert,
  type RepoParseIssueInsert,
  type RepoSymbolInsert,
  type RepoSymbolKind,
  type RepoSymbolOccurrenceInsert,
  type RepoSymbolOccurrenceRole,
  type RepoSymbolRelationshipInsert,
} from "../../../db/schema";
import type {
  ProjectAnalysisSummary,
  ProjectExportRecord,
  ProjectFileAnalysis,
  ProjectFileBlastRadius,
  ProjectFileSymbolRecord,
  ProjectGraphCycle,
  ProjectGraphData,
  ProjectGraphEdge,
  ProjectGraphFolderEdge,
  ProjectGraphNode,
  ProjectImportDiff,
  ProjectImportEdge,
  ProjectInsightsCycleCandidate,
  ProjectInsightsSummary,
  ProjectMapSearchResponse,
  ProjectSymbol,
  ProjectSymbolRelationshipRecord,
} from "./types/repo-parse-graph.types";

export type * from "./types/repo-parse-graph.types";

type Database = typeof import("../../../db").db;

function getSearchRank(value: string, query: string) {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedValue || !normalizedQuery) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (normalizedValue === normalizedQuery) {
    return 0;
  }

  if (normalizedValue.startsWith(normalizedQuery)) {
    return 1;
  }

  if (normalizedValue.includes(normalizedQuery)) {
    return 2;
  }

  return Number.MAX_SAFE_INTEGER;
}

function toPathBaseName(filePath: string) {
  const lastSegment = filePath.split("/").pop() ?? filePath;
  return lastSegment.replace(/\.[^.]+$/, "");
}

const MONOREPO_ROOT_SEGMENTS = new Set(["packages", "apps", "libs", "services"]);

function toTopLevelFolder(filePath: string) {
  if (!filePath.includes("/")) {
    return "(root)";
  }

  const parts = filePath.split("/");
  const first = parts[0] || "(root)";

  if (MONOREPO_ROOT_SEGMENTS.has(first) && parts[1]) {
    return `${first}/${parts[1]}`;
  }

  return first;
}

function buildEntryLikeReason(
  baseName: string,
  path: string,
  outgoingCount: number,
  incomingCount: number,
) {
  const reasons: string[] = [];

  if (["main", "app", "server", "cli", "worker", "entry", "bootstrap"].includes(baseName)) {
    reasons.push(`entry-style filename: ${baseName}`);
  } else if (baseName === "index") {
    reasons.push("high-signal index file");
  }

  const pathParts = path.split("/");
  const isMonorepoSrc =
    MONOREPO_ROOT_SEGMENTS.has(pathParts[0] ?? "") &&
    pathParts[2] === "src" &&
    pathParts.length === 4;

  if (!path.includes("/")) {
    reasons.push("root-level file");
  } else if (path.startsWith("src/") || path.startsWith("app/") || isMonorepoSrc) {
    reasons.push("top-level source path");
  }

  if (outgoingCount >= 5) {
    reasons.push("high outgoing dependency count");
  } else if (outgoingCount >= 3) {
    reasons.push("multiple internal dependencies");
  }

  if (incomingCount === 0) {
    reasons.push("not imported by other internal files");
  }

  return reasons.join(" · ");
}

export function createRepoParseGraphService(database: Database) {
  return {
    async updateImportParseMetadata(
      projectImportId: string,
      values: Partial<typeof projectImport.$inferInsert>,
    ) {
      const [updatedImport] = await database
        .update(projectImport)
        .set(values)
        .where(eq(projectImport.id, projectImportId))
        .returning();

      return updatedImport ?? null;
    },

    async saveFiles(files: RepoFileInsert[]) {
      if (files.length === 0) {
        return [] as ProjectFileRecord[];
      }

      return database.insert(repoFile).values(files).returning();
    },

    async clearImportData(projectImportId: string) {
      await database.transaction(async (tx) => {
        await tx
          .delete(repoExport)
          .where(eq(repoExport.projectImportId, projectImportId));
        await tx
          .delete(repoSymbolRelationship)
          .where(eq(repoSymbolRelationship.projectImportId, projectImportId));
        await tx
          .delete(repoSymbolOccurrence)
          .where(eq(repoSymbolOccurrence.projectImportId, projectImportId));
        await tx
          .delete(repoImportEdge)
          .where(eq(repoImportEdge.projectImportId, projectImportId));
        await tx
          .delete(repoExternalSymbol)
          .where(eq(repoExternalSymbol.projectImportId, projectImportId));
        await tx
          .delete(repoParseIssue)
          .where(eq(repoParseIssue.projectImportId, projectImportId));
        await tx
          .delete(repoSymbol)
          .where(eq(repoSymbol.projectImportId, projectImportId));
        await tx
          .delete(repoFile)
          .where(eq(repoFile.projectImportId, projectImportId));
      });
    },

    async saveSymbols(symbols: RepoSymbolInsert[]) {
      if (symbols.length === 0) {
        return [] as (typeof repoSymbol.$inferSelect)[];
      }

      return database.insert(repoSymbol).values(symbols).returning();
    },

    async saveOccurrences(occurrences: RepoSymbolOccurrenceInsert[]) {
      if (occurrences.length === 0) {
        return [] as (typeof repoSymbolOccurrence.$inferSelect)[];
      }

      return database.insert(repoSymbolOccurrence).values(occurrences).returning();
    },

    async saveRelationships(relationships: RepoSymbolRelationshipInsert[]) {
      if (relationships.length === 0) {
        return [] as (typeof repoSymbolRelationship.$inferSelect)[];
      }

      return database
        .insert(repoSymbolRelationship)
        .values(relationships)
        .returning();
    },

    async saveImportEdges(importEdges: RepoImportEdgeInsert[]) {
      if (importEdges.length === 0) {
        return [] as (typeof repoImportEdge.$inferSelect)[];
      }

      return database.insert(repoImportEdge).values(importEdges).returning();
    },

    async saveExports(exportsToSave: RepoExportInsert[]) {
      if (exportsToSave.length === 0) {
        return [] as (typeof repoExport.$inferSelect)[];
      }

      return database.insert(repoExport).values(exportsToSave).returning();
    },

    async saveParseIssues(issues: RepoParseIssueInsert[]) {
      if (issues.length === 0) {
        return [] as (typeof repoParseIssue.$inferSelect)[];
      }

      return database.insert(repoParseIssue).values(issues).returning();
    },

    async upsertExternalSymbols(symbols: RepoExternalSymbolInsert[]) {
      if (symbols.length === 0) {
        return [] as (typeof repoExternalSymbol.$inferSelect)[];
      }

      const inserted = await database
        .insert(repoExternalSymbol)
        .values(symbols)
        .onConflictDoNothing()
        .returning();

      return inserted;
    },

    /**
     * Incrementally re-syncs a single file's parse data.
     *
     * Deletes only the records *owned* by this file (symbols, outgoing import
     * edges, exports, issues) and replaces them with freshly parsed data.
     * Inbound edges (other files importing this file) are intentionally kept
     * so that reverse dependency analysis stays accurate.
     */
    async clearAndResyncFileData(
      projectImportId: string,
      fileRecord: ProjectFileRecord,
      data: {
        contentSha256: string | null;
        lineCount: number | null;
        symbols: RepoSymbolInsert[];
        importEdges: Array<RepoImportEdgeInsert & { localKey: string }>;
        exports: Array<RepoExportInsert & { symbolLocalKey?: string; sourceImportLocalKey?: string }>;
        issues: RepoParseIssueInsert[];
        externalSymbols: RepoExternalSymbolInsert[];
      },
    ): Promise<ProjectFileRecord> {
      const fileId = fileRecord.id;

      // Step 1: clear old per-file records in a transaction
      await database.transaction(async (tx) => {
        await tx
          .delete(repoExport)
          .where(eq(repoExport.fileId, fileId));
        await tx
          .delete(repoImportEdge)
          .where(eq(repoImportEdge.sourceFileId, fileId));
        await tx
          .delete(repoSymbol)
          .where(eq(repoSymbol.fileId, fileId)); // cascade → repoSymbolOccurrence
        await tx
          .delete(repoParseIssue)
          .where(
            and(
              eq(repoParseIssue.projectImportId, projectImportId),
              eq(repoParseIssue.fileId, fileId),
            ),
          );
      });

      // Step 2: update repoFile metadata
      const [updatedFile] = await database
        .update(repoFile)
        .set({
          contentSha256: data.contentSha256,
          lineCount: data.lineCount,
          parseStatus: "parsed",
          updatedAt: new Date(),
        })
        .where(eq(repoFile.id, fileId))
        .returning();

      if (!updatedFile) throw new Error(`repoFile not found: ${fileId}`);

      // Step 3: insert new symbols + occurrences
      const savedSymbols = data.symbols.length > 0
        ? await database.insert(repoSymbol).values(data.symbols).returning()
        : [];

      const symbolIdByLocalKey = new Map(
        savedSymbols
          .map((s) => [s.localSymbolKey, s.id] as const)
          .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
      );

      const occurrenceDrafts: RepoSymbolOccurrenceInsert[] = [];
      for (const symbol of data.symbols) {
        const symbolId = symbol.localSymbolKey
          ? symbolIdByLocalKey.get(symbol.localSymbolKey)
          : null;
        const location =
          (symbol.extraJson as { line: number; col: number } | null) ?? null;

        if (!symbolId || !location) continue;

        occurrenceDrafts.push({
          projectImportId,
          fileId,
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

      if (occurrenceDrafts.length > 0) {
        await database.insert(repoSymbolOccurrence).values(occurrenceDrafts);
      }

      // Step 4: insert new import edges
      const savedImportEdges = data.importEdges.length > 0
        ? await database
            .insert(repoImportEdge)
            .values(data.importEdges.map(({ localKey: _lk, ...edge }) => edge))
            .returning()
        : [];

      const importEdgeIdByLocalKey = new Map<string, string>();
      data.importEdges.forEach((draft, i) => {
        const saved = savedImportEdges[i];
        if (saved) importEdgeIdByLocalKey.set(draft.localKey, saved.id);
      });

      // Step 5: insert new exports
      if (data.exports.length > 0) {
        await database.insert(repoExport).values(
          data.exports.map(({ symbolLocalKey, sourceImportLocalKey, ...exp }) => ({
            ...exp,
            symbolId: symbolLocalKey ? (symbolIdByLocalKey.get(symbolLocalKey) ?? null) : null,
            sourceImportEdgeId: sourceImportLocalKey
              ? (importEdgeIdByLocalKey.get(sourceImportLocalKey) ?? null)
              : null,
          })),
        );
      }

      // Step 6: insert new issues
      if (data.issues.length > 0) {
        await database.insert(repoParseIssue).values(data.issues);
      }

      // Step 7: upsert external symbols (may already exist from other files)
      if (data.externalSymbols.length > 0) {
        await database
          .insert(repoExternalSymbol)
          .values(data.externalSymbols)
          .onConflictDoNothing();
      }

      return updatedFile;
    },

    async listFiles(
      projectImportId: string,
      options?: {
        language?: string;
        includeIgnored?: boolean;
      },
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

    async listImportEdges(
      projectImportId: string,
      options?: {
        includeExternal?: boolean;
      },
    ): Promise<ProjectImportEdge[]> {
      const edges = await database.query.repoImportEdge.findMany({
        where: options?.includeExternal
          ? eq(repoImportEdge.projectImportId, projectImportId)
          : and(
              eq(repoImportEdge.projectImportId, projectImportId),
              eq(repoImportEdge.isResolved, true),
            ),
        with: {
          sourceFile: true,
          targetFile: true,
        },
        orderBy: [asc(repoImportEdge.sourceFileId), asc(repoImportEdge.startLine)],
      });

      return edges
        .filter((edge) => options?.includeExternal || edge.targetFile !== null)
        .map((edge) => ({
          id: edge.id,
          projectImportId: edge.projectImportId,
          sourceFileId: edge.sourceFileId,
          sourceFilePath: edge.sourceFile.path,
          targetFileId: edge.targetFileId,
          targetFilePath: edge.targetFile?.path ?? null,
          targetPathText: edge.targetPathText,
          targetExternalSymbolKey: edge.targetExternalSymbolKey,
          moduleSpecifier: edge.moduleSpecifier,
          importKind: edge.importKind,
          isTypeOnly: edge.isTypeOnly,
          isResolved: edge.isResolved,
          resolutionKind: edge.resolutionKind,
          startLine: edge.startLine,
          startCol: edge.startCol,
          endLine: edge.endLine,
          endCol: edge.endCol,
          extraJson: edge.extraJson,
          createdAt: edge.createdAt,
        }));
    },

    async listFileImportEdges(
      projectImportId: string,
      fileId: string,
    ): Promise<ProjectImportEdge[]> {
      const edges = await database.query.repoImportEdge.findMany({
        where: and(
          eq(repoImportEdge.projectImportId, projectImportId),
          eq(repoImportEdge.sourceFileId, fileId),
        ),
        with: {
          sourceFile: true,
          targetFile: true,
        },
        orderBy: [asc(repoImportEdge.startLine), asc(repoImportEdge.startCol)],
      });

      return edges.map((edge) => ({
        id: edge.id,
        projectImportId: edge.projectImportId,
        sourceFileId: edge.sourceFileId,
        sourceFilePath: edge.sourceFile.path,
        targetFileId: edge.targetFileId,
        targetFilePath: edge.targetFile?.path ?? null,
        targetPathText: edge.targetPathText,
        targetExternalSymbolKey: edge.targetExternalSymbolKey,
        moduleSpecifier: edge.moduleSpecifier,
        importKind: edge.importKind,
        isTypeOnly: edge.isTypeOnly,
        isResolved: edge.isResolved,
        resolutionKind: edge.resolutionKind,
        startLine: edge.startLine,
        startCol: edge.startCol,
        endLine: edge.endLine,
        endCol: edge.endCol,
        extraJson: edge.extraJson,
        createdAt: edge.createdAt,
      }));
    },

    async listFileIncomingImportEdges(
      projectImportId: string,
      fileId: string,
    ): Promise<ProjectImportEdge[]> {
      const edges = await database.query.repoImportEdge.findMany({
        where: and(
          eq(repoImportEdge.projectImportId, projectImportId),
          eq(repoImportEdge.targetFileId, fileId),
          eq(repoImportEdge.isResolved, true),
        ),
        with: {
          sourceFile: true,
          targetFile: true,
        },
        orderBy: [asc(repoImportEdge.startLine), asc(repoImportEdge.startCol)],
      });

      return edges
        .filter((edge) => edge.sourceFile !== null && edge.targetFile !== null)
        .map((edge) => ({
          id: edge.id,
          projectImportId: edge.projectImportId,
          sourceFileId: edge.sourceFileId,
          sourceFilePath: edge.sourceFile.path,
          targetFileId: edge.targetFileId,
          targetFilePath: edge.targetFile?.path ?? null,
          targetPathText: edge.targetPathText,
          targetExternalSymbolKey: edge.targetExternalSymbolKey,
          moduleSpecifier: edge.moduleSpecifier,
          importKind: edge.importKind,
          isTypeOnly: edge.isTypeOnly,
          isResolved: edge.isResolved,
          resolutionKind: edge.resolutionKind,
          startLine: edge.startLine,
          startCol: edge.startCol,
          endLine: edge.endLine,
          endCol: edge.endCol,
          extraJson: edge.extraJson,
          createdAt: edge.createdAt,
        }))
        .sort((left, right) => {
          const pathComparison = left.sourceFilePath.localeCompare(
            right.sourceFilePath,
          );

          if (pathComparison !== 0) {
            return pathComparison;
          }

          if (left.startLine !== right.startLine) {
            return left.startLine - right.startLine;
          }

          return left.startCol - right.startCol;
        });
    },

    async getFileAnalysis(
      projectImportId: string,
      fileId: string,
    ): Promise<ProjectFileAnalysis> {
      // Load all files and edges once — shared by blast radius + cycles computation
      const [files, edges] = await Promise.all([
        database.query.repoFile.findMany({
          where: and(
            eq(repoFile.projectImportId, projectImportId),
            eq(repoFile.isIgnored, false),
          ),
          orderBy: [asc(repoFile.path)],
        }),
        database.query.repoImportEdge.findMany({
          where: and(
            eq(repoImportEdge.projectImportId, projectImportId),
            eq(repoImportEdge.isResolved, true),
          ),
        }),
      ]);

      // ── Shared data structures ──────────────────────────────────────────────

      const fileStats = new Map<
        string,
        { path: string; language: string | null; incomingCount: number; outgoingCount: number }
      >();
      // forward adjacency: sourceId → Set<targetId>
      const forwardAdjacency = new Map<string, Set<string>>();
      // reverse adjacency: targetId → Set<sourceId>  (for blast radius BFS)
      const reverseAdjacency = new Map<string, Set<string>>();
      const edgeCounts = new Map<string, number>();

      for (const file of files) {
        fileStats.set(file.id, {
          path: file.path,
          language: file.language,
          incomingCount: 0,
          outgoingCount: 0,
        });
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

      // ── Blast radius (reverse BFS from fileId) ─────────────────────────────

      const directDependents = reverseAdjacency.get(fileId) ?? new Set<string>();
      const visited = new Set<string>();
      const queue = Array.from(directDependents).map((dependentId) => ({
        fileId: dependentId,
        depth: 1,
      }));
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

      // ── Cycles (Tarjan SCC on forward adjacency, filtered to fileId) ────────

      const cycleCandidates: ProjectInsightsCycleCandidate[] = [];
      const seenDirectKeys = new Set<string>();

      // Direct (2-file) cycles: A ↔ B
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
          edgeCount:
            (edgeCounts.get(`${fileId}->${targetId}`) ?? 1) +
            (edgeCounts.get(`${targetId}->${fileId}`) ?? 1),
          summary: `${sortedPaths[0]} and ${sortedPaths[1]} import each other`,
        });
      }

      // SCC cycles via Tarjan — only those containing fileId
      const allNodeIds = Array.from(fileStats.keys());
      const visitedIndices = new Map<string, number>();
      const lowLinks = new Map<string, number>();
      const sccStack: string[] = [];
      const sccStackSet = new Set<string>();
      let sccIndex = 0;
      const sccs: string[][] = [];

      const strongConnect = (nodeId: string) => {
        visitedIndices.set(nodeId, sccIndex);
        lowLinks.set(nodeId, sccIndex);
        sccIndex += 1;
        sccStack.push(nodeId);
        sccStackSet.add(nodeId);

        for (const neighborId of forwardAdjacency.get(nodeId) ?? []) {
          if (!visitedIndices.has(neighborId)) {
            strongConnect(neighborId);
            lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId) ?? 0, lowLinks.get(neighborId) ?? 0));
          } else if (sccStackSet.has(neighborId)) {
            lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId) ?? 0, visitedIndices.get(neighborId) ?? 0));
          }
        }

        if (lowLinks.get(nodeId) === visitedIndices.get(nodeId)) {
          const component: string[] = [];
          let curr: string | undefined;
          do {
            curr = sccStack.pop();
            if (!curr) break;
            sccStackSet.delete(curr);
            component.push(curr);
          } while (curr !== nodeId);
          if (component.length > 1) sccs.push(component);
        }
      };

      for (const id of allNodeIds) {
        if (!visitedIndices.has(id)) strongConnect(id);
      }

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

        cycleCandidates.push({
          kind: "scc",
          paths,
          edgeCount,
          summary: `${paths.length}-file dependency cycle`,
        });
      }

      return { blastRadius, cycles: cycleCandidates };
    },

    async listSymbols(
      projectImportId: string,
      options?: {
        fileId?: string;
        kind?: RepoSymbolKind;
      },
    ): Promise<ProjectSymbol[]> {
      const filters = [eq(repoSymbol.projectImportId, projectImportId)];

      if (options?.fileId) {
        filters.push(eq(repoSymbol.fileId, options.fileId));
      }

      if (options?.kind) {
        filters.push(eq(repoSymbol.kind, options.kind));
      }

      const symbols = await database.query.repoSymbol.findMany({
        where: and(...filters),
        with: {
          file: true,
          parentSymbol: true,
        },
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
      const [symbols, occurrences] = await Promise.all([
        database.query.repoSymbol.findMany({
          where: and(
            eq(repoSymbol.projectImportId, projectImportId),
            eq(repoSymbol.fileId, fileId),
          ),
          with: {
            parentSymbol: true,
          },
          orderBy: [asc(repoSymbol.displayName)],
        }),
        database.query.repoSymbolOccurrence.findMany({
          where: and(
            eq(repoSymbolOccurrence.projectImportId, projectImportId),
            eq(repoSymbolOccurrence.fileId, fileId),
          ),
          orderBy: [
            asc(repoSymbolOccurrence.startLine),
            asc(repoSymbolOccurrence.startCol),
          ],
        }),
      ]);

      const occurrencePriority = new Map<RepoSymbolOccurrenceRole, number>([
        ["definition", 0],
        ["declaration", 1],
        ["export", 2],
        ["import", 3],
        ["type_reference", 4],
        ["reference", 5],
      ]);
      const occurrenceBySymbolId = new Map<
        string,
        (typeof occurrences)[number]
      >();

      for (const occurrence of occurrences) {
        if (!occurrence.symbolId) {
          continue;
        }

        const current = occurrenceBySymbolId.get(occurrence.symbolId);

        if (!current) {
          occurrenceBySymbolId.set(occurrence.symbolId, occurrence);
          continue;
        }

        const currentPriority =
          occurrencePriority.get(current.occurrenceRole) ?? Number.MAX_SAFE_INTEGER;
        const nextPriority =
          occurrencePriority.get(occurrence.occurrenceRole) ??
          Number.MAX_SAFE_INTEGER;

        if (nextPriority < currentPriority) {
          occurrenceBySymbolId.set(occurrence.symbolId, occurrence);
        }
      }

      return symbols
        .map((symbol) => {
          const occurrence = occurrenceBySymbolId.get(symbol.id);

          return {
            id: symbol.id,
            displayName: symbol.displayName,
            kind: symbol.kind,
            signature: symbol.signature,
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

          if (left.startLine === null) {
            return 1;
          }

          if (right.startLine === null) {
            return -1;
          }

          if (left.startLine !== right.startLine) {
            return left.startLine - right.startLine;
          }

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
        with: {
          file: true,
          symbol: true,
          sourceImportEdge: true,
        },
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

      if (options?.onlyImplementations) {
        filters.push(eq(repoSymbolRelationship.isImplementation, true));
      }

      if (options?.onlyReferences) {
        filters.push(eq(repoSymbolRelationship.isReference, true));
      }

      if (options?.onlyTypeDefinitions) {
        filters.push(eq(repoSymbolRelationship.isTypeDefinition, true));
      }

      const relationships = await database.query.repoSymbolRelationship.findMany({
        where: and(...filters),
        with: {
          fromSymbol: true,
          toSymbol: true,
        },
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

    async compareImports(
      previousProjectImportId: string,
      currentProjectImportId: string,
    ): Promise<ProjectImportDiff> {
      const [previousFiles, currentFiles, previousSymbols, currentSymbols] =
        await Promise.all([
          database.query.repoFile.findMany({
            where: eq(repoFile.projectImportId, previousProjectImportId),
          }),
          database.query.repoFile.findMany({
            where: eq(repoFile.projectImportId, currentProjectImportId),
          }),
          database.query.repoSymbol.findMany({
            where: eq(repoSymbol.projectImportId, previousProjectImportId),
          }),
          database.query.repoSymbol.findMany({
            where: eq(repoSymbol.projectImportId, currentProjectImportId),
          }),
        ]);

      const previousFileByPath = new Map(
        previousFiles.map((file) => [file.path, file] as const),
      );
      const currentFileByPath = new Map(
        currentFiles.map((file) => [file.path, file] as const),
      );

      const addedFiles = currentFiles.filter(
        (file) => !previousFileByPath.has(file.path),
      );
      const removedFiles = previousFiles.filter(
        (file) => !currentFileByPath.has(file.path),
      );
      const changedFiles = currentFiles.flatMap((file) => {
        const previousFile = previousFileByPath.get(file.path);

        if (!previousFile) {
          return [];
        }

        if (
          previousFile.contentSha256 === file.contentSha256 &&
          previousFile.sizeBytes === file.sizeBytes &&
          previousFile.parseStatus === file.parseStatus
        ) {
          return [];
        }

        return [
          {
            current: file,
            previous: previousFile,
          },
        ];
      });

      const previousSymbolKeys = new Set(
        previousSymbols
          .map((symbol) => symbol.stableSymbolKey ?? symbol.localSymbolKey)
          .filter((symbolKey): symbolKey is string => Boolean(symbolKey)),
      );
      const currentSymbolKeys = new Set(
        currentSymbols
          .map((symbol) => symbol.stableSymbolKey ?? symbol.localSymbolKey)
          .filter((symbolKey): symbolKey is string => Boolean(symbolKey)),
      );

      const addedSymbolKeys = [...currentSymbolKeys].filter(
        (symbolKey) => !previousSymbolKeys.has(symbolKey),
      );
      const removedSymbolKeys = [...previousSymbolKeys].filter(
        (symbolKey) => !currentSymbolKeys.has(symbolKey),
      );

      return {
        addedFiles,
        removedFiles,
        changedFiles,
        addedSymbolKeys,
        removedSymbolKeys,
      };
    },

    async getProjectAnalysisSummary(
      projectImportId: string,
    ): Promise<ProjectAnalysisSummary> {
      const [files, importEdges, symbols] = await Promise.all([
        database.query.repoFile.findMany({
          where: and(
            eq(repoFile.projectImportId, projectImportId),
            eq(repoFile.isIgnored, false),
          ),
          orderBy: [asc(repoFile.path)],
        }),
        database.query.repoImportEdge.findMany({
          where: eq(repoImportEdge.projectImportId, projectImportId),
          with: {
            sourceFile: true,
            targetFile: true,
          },
        }),
        database.query.repoSymbol.findMany({
          where: eq(repoSymbol.projectImportId, projectImportId),
          columns: {
            id: true,
          },
        }),
      ]);

      const fileStats = new Map<
        string,
        { path: string; outgoingCount: number; incomingCount: number }
      >();
      const folderCounts = new Map<string, number>();
      const languageCounts = new Map<string, number>();

      for (const file of files) {
        fileStats.set(file.id, {
          path: file.path,
          outgoingCount: 0,
          incomingCount: 0,
        });

        if (file.isParseable) {
          const topFolder = file.path.includes("/")
            ? file.path.split("/")[0] || "(root)"
            : "(root)";

          folderCounts.set(topFolder, (folderCounts.get(topFolder) ?? 0) + 1);

          const language = file.language ?? "Unknown";
          languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
        }
      }

      for (const edge of importEdges) {
        const sourceStats = fileStats.get(edge.sourceFileId);
        if (sourceStats) {
          sourceStats.outgoingCount += 1;
        }

        if (edge.targetFileId) {
          const targetStats = fileStats.get(edge.targetFileId);
          if (targetStats) {
            targetStats.incomingCount += 1;
          }
        }
      }

      return {
        topFilesByDependencies: Array.from(fileStats.values())
          .filter((item) => item.outgoingCount > 0 || item.incomingCount > 0)
          .sort((left, right) => {
            const rightTotal = right.outgoingCount + right.incomingCount;
            const leftTotal = left.outgoingCount + left.incomingCount;

            if (leftTotal !== rightTotal) {
              return rightTotal - leftTotal;
            }

            return left.path.localeCompare(right.path);
          })
          .slice(0, 8),
        topFolders: Array.from(folderCounts.entries())
          .map(([folder, sourceFileCount]) => ({
            folder,
            sourceFileCount,
          }))
          .sort((left, right) => {
            if (left.sourceFileCount !== right.sourceFileCount) {
              return right.sourceFileCount - left.sourceFileCount;
            }

            return left.folder.localeCompare(right.folder);
          })
          .slice(0, 8),
        sourceFileDistribution: Array.from(languageCounts.entries())
          .map(([language, fileCount]) => ({
            language,
            fileCount,
          }))
          .sort((left, right) => {
            if (left.fileCount !== right.fileCount) {
              return right.fileCount - left.fileCount;
            }

            return left.language.localeCompare(right.language);
          }),
        totals: {
          files: files.length,
          sourceFiles: files.filter((file) => file.isParseable).length,
          parsedFiles: files.filter((file) => file.parseStatus === "parsed").length,
          dependencies: importEdges.length,
          symbols: symbols.length,
        },
      };
    },

    async getProjectInsights(
      projectImportId: string,
    ): Promise<ProjectInsightsSummary> {
      const [files, importEdges, symbols] = await Promise.all([
        database.query.repoFile.findMany({
          where: and(
            eq(repoFile.projectImportId, projectImportId),
            eq(repoFile.isIgnored, false),
          ),
          orderBy: [asc(repoFile.path)],
        }),
        database.query.repoImportEdge.findMany({
          where: eq(repoImportEdge.projectImportId, projectImportId),
          with: {
            sourceFile: true,
            targetFile: true,
          },
        }),
        database.query.repoSymbol.findMany({
          where: eq(repoSymbol.projectImportId, projectImportId),
          columns: {
            id: true,
          },
        }),
      ]);

      const fileStats = new Map<
        string,
        {
          id: string;
          path: string;
          language: string | null;
          incomingCount: number;
          outgoingCount: number;
          isParseable: boolean;
        }
      >();
      const folderCounts = new Map<string, number>();
      const internalAdjacency = new Map<string, Set<string>>();
      const internalEdgeCounts = new Map<string, number>();

      for (const file of files) {
        fileStats.set(file.id, {
          id: file.id,
          path: file.path,
          language: file.language,
          incomingCount: 0,
          outgoingCount: 0,
          isParseable: file.isParseable,
        });

        if (file.isParseable) {
          const topFolder = toTopLevelFolder(file.path);
          folderCounts.set(topFolder, (folderCounts.get(topFolder) ?? 0) + 1);
        }
      }

      for (const edge of importEdges) {
        if (!edge.targetFileId) {
          continue;
        }

        const sourceStats = fileStats.get(edge.sourceFileId);
        const targetStats = fileStats.get(edge.targetFileId);

        if (!sourceStats || !targetStats) {
          continue;
        }

        sourceStats.outgoingCount += 1;
        targetStats.incomingCount += 1;

        if (!internalAdjacency.has(edge.sourceFileId)) {
          internalAdjacency.set(edge.sourceFileId, new Set());
        }

        internalAdjacency.get(edge.sourceFileId)?.add(edge.targetFileId);
      }

      for (const [sourceId, targetIds] of internalAdjacency.entries()) {
        for (const targetId of targetIds) {
          internalEdgeCounts.set(
            `${sourceId}->${targetId}`,
            (internalEdgeCounts.get(`${sourceId}->${targetId}`) ?? 0) + 1,
          );
        }
      }

      const sourceFiles = Array.from(fileStats.values()).filter(
        (item) => item.isParseable,
      );

      const topFilesByImportCount = [...sourceFiles]
        .filter((item) => item.outgoingCount > 0)
        .sort((left, right) => {
          if (left.outgoingCount !== right.outgoingCount) {
            return right.outgoingCount - left.outgoingCount;
          }

          if (left.incomingCount !== right.incomingCount) {
            return right.incomingCount - left.incomingCount;
          }

          return left.path.localeCompare(right.path);
        })
        .slice(0, 12)
        .map(({ path, language, incomingCount, outgoingCount }) => ({
          path,
          language,
          incomingCount,
          outgoingCount,
        }));

      const topFilesByInboundDependencyCount = [...sourceFiles]
        .filter((item) => item.incomingCount > 0)
        .sort((left, right) => {
          if (left.incomingCount !== right.incomingCount) {
            return right.incomingCount - left.incomingCount;
          }

          if (left.outgoingCount !== right.outgoingCount) {
            return right.outgoingCount - left.outgoingCount;
          }

          return left.path.localeCompare(right.path);
        })
        .slice(0, 12)
        .map(({ path, language, incomingCount, outgoingCount }) => ({
          path,
          language,
          incomingCount,
          outgoingCount,
        }));

      const orphanFiles = [...sourceFiles]
        .filter((item) => item.incomingCount === 0 && item.outgoingCount === 0)
        .sort((left, right) => left.path.localeCompare(right.path))
        .slice(0, 24)
        .map(({ path, language, incomingCount, outgoingCount }) => ({
          path,
          language,
          incomingCount,
          outgoingCount,
        }));

      const entryLikeFiles = [...sourceFiles]
        .map((item) => {
          const baseName = toPathBaseName(item.path).toLowerCase();
          const normalizedPath = item.path.toLowerCase();
          const disqualifyingPattern =
            normalizedPath.includes(".test.") ||
            normalizedPath.includes(".spec.") ||
            normalizedPath.includes(".stories.") ||
            normalizedPath.includes("/test/") ||
            normalizedPath.includes("/tests/") ||
            normalizedPath.includes("/__tests__/") ||
            normalizedPath.includes("/mocks/") ||
            normalizedPath.includes("/mock/") ||
            normalizedPath.includes("/fixtures/") ||
            normalizedPath.includes("/utils/") ||
            normalizedPath.includes("/helpers/") ||
            normalizedPath.includes("/constants/");

          let score = 0;

          if (
            ["main", "app", "server", "cli", "worker", "entry", "bootstrap"].includes(
              baseName,
            )
          ) {
            score += 5;
          } else if (
            baseName === "index" &&
            item.outgoingCount >= 3 &&
            (item.path.startsWith("src/") ||
              item.path.startsWith("app/") ||
              !item.path.includes("/"))
          ) {
            score += 3;
          }

          const pathParts = item.path.split("/");
          const isMonorepoSrc =
            MONOREPO_ROOT_SEGMENTS.has(pathParts[0] ?? "") &&
            pathParts[2] === "src" &&
            pathParts.length === 4;

          if (!item.path.includes("/")) {
            score += 2;
          } else if (
            item.path.startsWith("src/") ||
            item.path.startsWith("app/") ||
            isMonorepoSrc
          ) {
            score += 2;
          }

          if (item.outgoingCount >= 5) {
            score += 3;
          } else if (item.outgoingCount >= 3) {
            score += 2;
          }

          if (item.incomingCount === 0) {
            score += 1;
          }

          if (disqualifyingPattern) {
            score -= 4;
          }

          return {
            ...item,
            score,
            reason:
              score >= 5
                ? buildEntryLikeReason(
                    baseName,
                    item.path,
                    item.outgoingCount,
                    item.incomingCount,
                  )
                : "",
          };
        })
        .filter((item) => item.score >= 5 && item.reason)
        .sort((left, right) => {
          if (left.score !== right.score) {
            return right.score - left.score;
          }

          if (left.outgoingCount !== right.outgoingCount) {
            return right.outgoingCount - left.outgoingCount;
          }

          return left.path.localeCompare(right.path);
        })
        .slice(0, 12)
        .map(({ path, language, incomingCount, outgoingCount, score, reason }) => ({
          path,
          language,
          incomingCount,
          outgoingCount,
          score,
          reason,
        }));

      const directCycleCandidates = new Map<string, ProjectInsightsCycleCandidate>();

      for (const [sourceId, targetIds] of internalAdjacency.entries()) {
        for (const targetId of targetIds) {
          const reverseTargets = internalAdjacency.get(targetId);

          if (!reverseTargets?.has(sourceId)) {
            continue;
          }

          const sourcePath = fileStats.get(sourceId)?.path;
          const targetPath = fileStats.get(targetId)?.path;

          if (!sourcePath || !targetPath) {
            continue;
          }

          const sortedPaths = [sourcePath, targetPath].sort((left, right) =>
            left.localeCompare(right),
          );
          const key = sortedPaths.join("::");

          if (directCycleCandidates.has(key)) {
            continue;
          }

          directCycleCandidates.set(key, {
            kind: "direct",
            paths: sortedPaths,
            edgeCount:
              (internalEdgeCounts.get(`${sourceId}->${targetId}`) ?? 1) +
              (internalEdgeCounts.get(`${targetId}->${sourceId}`) ?? 1),
            summary: `${sortedPaths[0]} and ${sortedPaths[1]} import each other`,
          });
        }
      }

      const stronglyConnectedComponents: string[][] = [];
      const visitedIndices = new Map<string, number>();
      const lowLinks = new Map<string, number>();
      const stack: string[] = [];
      const stackSet = new Set<string>();
      let index = 0;

      const strongConnect = (nodeId: string) => {
        visitedIndices.set(nodeId, index);
        lowLinks.set(nodeId, index);
        index += 1;
        stack.push(nodeId);
        stackSet.add(nodeId);

        for (const neighborId of internalAdjacency.get(nodeId) ?? []) {
          if (!visitedIndices.has(neighborId)) {
            strongConnect(neighborId);
            lowLinks.set(
              nodeId,
              Math.min(lowLinks.get(nodeId) ?? 0, lowLinks.get(neighborId) ?? 0),
            );
          } else if (stackSet.has(neighborId)) {
            lowLinks.set(
              nodeId,
              Math.min(
                lowLinks.get(nodeId) ?? 0,
                visitedIndices.get(neighborId) ?? 0,
              ),
            );
          }
        }

        if (lowLinks.get(nodeId) === visitedIndices.get(nodeId)) {
          const component: string[] = [];
          let currentNodeId: string | undefined;

          do {
            currentNodeId = stack.pop();

            if (!currentNodeId) {
              break;
            }

            stackSet.delete(currentNodeId);
            component.push(currentNodeId);
          } while (currentNodeId !== nodeId);

          if (component.length > 1) {
            stronglyConnectedComponents.push(component);
          }
        }
      };

      for (const file of sourceFiles) {
        if (!visitedIndices.has(file.id)) {
          strongConnect(file.id);
        }
      }

      const circularDependencyCandidates = [
        ...Array.from(directCycleCandidates.values()),
        ...stronglyConnectedComponents
          .filter((component) => component.length >= 3 && component.length <= 5)
          .map((component) => {
            const paths = component
              .map((fileId) => fileStats.get(fileId)?.path)
              .filter((path): path is string => Boolean(path))
              .sort((left, right) => left.localeCompare(right));
            const componentSet = new Set(component);
            let edgeCount = 0;

            for (const fileId of component) {
              for (const neighborId of internalAdjacency.get(fileId) ?? []) {
                if (componentSet.has(neighborId)) {
                  edgeCount += 1;
                }
              }
            }

            return {
              kind: "scc" as const,
              paths,
              edgeCount,
              summary: `${paths.length}-file dependency cycle candidate`,
            };
          }),
      ]
        .sort((left, right) => {
          if (left.kind !== right.kind) {
            return left.kind === "direct" ? -1 : 1;
          }

          if (left.paths.length !== right.paths.length) {
            return left.paths.length - right.paths.length;
          }

          if (left.edgeCount !== right.edgeCount) {
            return right.edgeCount - left.edgeCount;
          }

          return left.paths.join("::").localeCompare(right.paths.join("::"));
        })
        .slice(0, 12);

      return {
        topFilesByImportCount,
        topFilesByInboundDependencyCount,
        topFoldersBySourceFileCount: Array.from(folderCounts.entries())
          .map(([folder, sourceFileCount]) => ({
            folder,
            sourceFileCount,
          }))
          .sort((left, right) => {
            if (left.sourceFileCount !== right.sourceFileCount) {
              return right.sourceFileCount - left.sourceFileCount;
            }

            return left.folder.localeCompare(right.folder);
          })
          .slice(0, 12),
        orphanFiles,
        entryLikeFiles,
        circularDependencyCandidates,
        totals: {
          files: files.length,
          sourceFiles: sourceFiles.length,
          parsedFiles: files.filter((file) => file.parseStatus === "parsed").length,
          dependencies: importEdges.length,
          symbols: symbols.length,
        },
      };
    },

    async getProjectGraph(
      projectImportId: string,
    ): Promise<ProjectGraphData> {
      const [files, importEdges] = await Promise.all([
        database.query.repoFile.findMany({
          where: and(
            eq(repoFile.projectImportId, projectImportId),
            eq(repoFile.isIgnored, false),
          ),
          orderBy: [asc(repoFile.path)],
        }),
        database.query.repoImportEdge.findMany({
          where: eq(repoImportEdge.projectImportId, projectImportId),
          with: {
            sourceFile: true,
            targetFile: true,
          },
        }),
      ]);

      const fileStats = new Map<
        string,
        {
          id: string;
          path: string;
          language: string | null;
          incomingCount: number;
          outgoingCount: number;
          isParseable: boolean;
        }
      >();

      for (const file of files) {
        fileStats.set(file.id, {
          id: file.id,
          path: file.path,
          language: file.language,
          incomingCount: 0,
          outgoingCount: 0,
          isParseable: file.isParseable,
        });
      }

      const seenEdges = new Set<string>();
      const graphEdges: ProjectGraphEdge[] = [];
      const internalAdjacency = new Map<string, Set<string>>();
      const folderStats = new Map<
        string,
        {
          id: string;
          folder: string;
          fileCount: number;
          sourceFileCount: number;
          incomingCount: number;
          outgoingCount: number;
          internalEdgeCount: number;
        }
      >();
      const folderEdgeCounts = new Map<string, ProjectGraphFolderEdge>();

      const ensureFolderStats = (folder: string) => {
        const id = `folder:${folder}`;
        const existing = folderStats.get(folder);

        if (existing) {
          return existing;
        }

        const created = {
          id,
          folder,
          fileCount: 0,
          sourceFileCount: 0,
          incomingCount: 0,
          outgoingCount: 0,
          internalEdgeCount: 0,
        };

        folderStats.set(folder, created);
        return created;
      };

      for (const edge of importEdges) {
        if (!edge.targetFileId) {
          continue;
        }

        const sourceStats = fileStats.get(edge.sourceFileId);
        const targetStats = fileStats.get(edge.targetFileId);

        if (!sourceStats || !targetStats) {
          continue;
        }

        sourceStats.outgoingCount += 1;
        targetStats.incomingCount += 1;

        const edgeKey = `${edge.sourceFileId}->${edge.targetFileId}`;

        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          graphEdges.push({
            id: edgeKey,
            source: edge.sourceFileId,
            target: edge.targetFileId,
            importKind: edge.importKind,
            isResolved: edge.isResolved,
            resolutionKind: edge.resolutionKind,
          });
        }

        if (!internalAdjacency.has(edge.sourceFileId)) {
          internalAdjacency.set(edge.sourceFileId, new Set());
        }

        internalAdjacency.get(edge.sourceFileId)?.add(edge.targetFileId);

        const sourceFolder = toTopLevelFolder(sourceStats.path);
        const targetFolder = toTopLevelFolder(targetStats.path);
        const sourceFolderStats = ensureFolderStats(sourceFolder);
        const targetFolderStats = ensureFolderStats(targetFolder);

        sourceFolderStats.outgoingCount += 1;
        targetFolderStats.incomingCount += 1;
        sourceFolderStats.internalEdgeCount += 1;

        if (sourceFolder !== targetFolder) {
          const sourceFolderId = `folder:${sourceFolder}`;
          const targetFolderId = `folder:${targetFolder}`;
          const folderEdgeKey = `${sourceFolderId}->${targetFolderId}`;
          const existingFolderEdge = folderEdgeCounts.get(folderEdgeKey);

          if (existingFolderEdge) {
            existingFolderEdge.edgeCount += 1;
          } else {
            folderEdgeCounts.set(folderEdgeKey, {
              id: folderEdgeKey,
              source: sourceFolderId,
              target: targetFolderId,
              edgeCount: 1,
            });
          }
        }
      }

      const sourceFiles = Array.from(fileStats.values()).filter(
        (item) => item.isParseable,
      );

      // Tarjan SCC for cycle detection
      const stronglyConnectedComponents: string[][] = [];
      const visitedIndices = new Map<string, number>();
      const lowLinks = new Map<string, number>();
      const stack: string[] = [];
      const stackSet = new Set<string>();
      let index = 0;

      const strongConnect = (nodeId: string) => {
        visitedIndices.set(nodeId, index);
        lowLinks.set(nodeId, index);
        index += 1;
        stack.push(nodeId);
        stackSet.add(nodeId);

        for (const neighborId of internalAdjacency.get(nodeId) ?? []) {
          if (!visitedIndices.has(neighborId)) {
            strongConnect(neighborId);
            lowLinks.set(
              nodeId,
              Math.min(lowLinks.get(nodeId) ?? 0, lowLinks.get(neighborId) ?? 0),
            );
          } else if (stackSet.has(neighborId)) {
            lowLinks.set(
              nodeId,
              Math.min(
                lowLinks.get(nodeId) ?? 0,
                visitedIndices.get(neighborId) ?? 0,
              ),
            );
          }
        }

        if (lowLinks.get(nodeId) === visitedIndices.get(nodeId)) {
          const component: string[] = [];
          let currentNodeId: string | undefined;

          do {
            currentNodeId = stack.pop();

            if (!currentNodeId) {
              break;
            }

            stackSet.delete(currentNodeId);
            component.push(currentNodeId);
          } while (currentNodeId !== nodeId);

          if (component.length > 1) {
            stronglyConnectedComponents.push(component);
          }
        }
      };

      for (const file of sourceFiles) {
        if (!visitedIndices.has(file.id)) {
          strongConnect(file.id);
        }
      }

      const cycles: ProjectGraphCycle[] = [];

      // Direct (2-file) cycles
      const seenDirectCycleKeys = new Set<string>();

      for (const [sourceId, targetIds] of internalAdjacency.entries()) {
        for (const targetId of targetIds) {
          const reverseTargets = internalAdjacency.get(targetId);

          if (!reverseTargets?.has(sourceId)) {
            continue;
          }

          const sourcePath = fileStats.get(sourceId)?.path;
          const targetPath = fileStats.get(targetId)?.path;

          if (!sourcePath || !targetPath) {
            continue;
          }

          const sortedPaths = [sourcePath, targetPath].sort((a, b) => a.localeCompare(b));
          const key = sortedPaths.join("::");

          if (seenDirectCycleKeys.has(key)) {
            continue;
          }

          seenDirectCycleKeys.add(key);

          const sortedIds = sortedPaths.map(
            (p) => Array.from(fileStats.values()).find((f) => f.path === p)?.id ?? "",
          );

          cycles.push({
            kind: "direct",
            paths: sortedPaths,
            nodeIds: sortedIds.filter(Boolean),
          });
        }
      }

      // SCC cycles (3+ files, no upper cap for graph)
      for (const component of stronglyConnectedComponents) {
        if (component.length < 3) {
          continue;
        }

        const paths = component
          .map((fileId) => fileStats.get(fileId)?.path)
          .filter((p): p is string => Boolean(p))
          .sort((a, b) => a.localeCompare(b));

        cycles.push({
          kind: "scc",
          paths,
          nodeIds: component,
        });
      }

      const nodes: ProjectGraphNode[] = Array.from(fileStats.values()).map((file) => {
        const lastSlash = file.path.lastIndexOf("/");
        const dirPath = lastSlash >= 0 ? file.path.slice(0, lastSlash) : "";
        const folder = toTopLevelFolder(file.path);
        const stats = ensureFolderStats(folder);

        stats.fileCount += 1;

        if (file.isParseable) {
          stats.sourceFileCount += 1;
        }

        return {
          id: file.id,
          path: file.path,
          language: file.language,
          dirPath,
          incomingCount: file.incomingCount,
          outgoingCount: file.outgoingCount,
          isParseable: file.isParseable,
        };
      });

      return {
        nodes,
        edges: graphEdges,
        cycles,
        folderNodes: Array.from(folderStats.values()).sort((left, right) => {
          if (left.sourceFileCount !== right.sourceFileCount) {
            return right.sourceFileCount - left.sourceFileCount;
          }

          return left.folder.localeCompare(right.folder);
        }),
        folderEdges: Array.from(folderEdgeCounts.values()).sort((left, right) => {
          if (left.edgeCount !== right.edgeCount) {
            return right.edgeCount - left.edgeCount;
          }

          return left.id.localeCompare(right.id);
        }),
        stats: {
          nodeCount: nodes.length,
          edgeCount: graphEdges.length,
          cycleCount: cycles.length,
          folderCount: folderStats.size,
          folderEdgeCount: folderEdgeCounts.size,
        },
      };
    },

    async searchProjectMap(
      projectImportId: string,
      query: string,
    ): Promise<ProjectMapSearchResponse> {
      const normalizedQuery = query.trim().toLowerCase();

      if (normalizedQuery.length < 2) {
        return {
          files: [],
          symbols: [],
          exports: [],
        };
      }

      const containsPattern = `%${normalizedQuery}%`;

      const [fileMatches, symbolMatches, exportMatches] = await Promise.all([
        database.query.repoFile.findMany({
          where: and(
            eq(repoFile.projectImportId, projectImportId),
            ilike(repoFile.path, containsPattern),
          ),
          orderBy: [asc(repoFile.path)],
          limit: 50,
        }),
        database.query.repoSymbol.findMany({
          where: and(
            eq(repoSymbol.projectImportId, projectImportId),
            ilike(repoSymbol.displayName, containsPattern),
          ),
          with: {
            file: true,
            parentSymbol: true,
          },
          orderBy: [asc(repoSymbol.displayName), asc(repoSymbol.fileId)],
          limit: 50,
        }),
        database.query.repoExport.findMany({
          where: and(
            eq(repoExport.projectImportId, projectImportId),
            ilike(repoExport.exportName, containsPattern),
          ),
          with: {
            file: true,
          },
          orderBy: [asc(repoExport.exportName), asc(repoExport.fileId)],
          limit: 50,
        }),
      ]);

      const symbolIds = symbolMatches.map((symbol) => symbol.id);
      const exportSymbolIds = exportMatches
        .map((item) => item.symbolId)
        .filter((symbolId): symbolId is string => Boolean(symbolId));
      const allSymbolIds = [...new Set([...symbolIds, ...exportSymbolIds])];

      const occurrences =
        allSymbolIds.length > 0
          ? await database.query.repoSymbolOccurrence.findMany({
              where: and(
                eq(repoSymbolOccurrence.projectImportId, projectImportId),
                inArray(repoSymbolOccurrence.symbolId, allSymbolIds),
              ),
              orderBy: [
                asc(repoSymbolOccurrence.startLine),
                asc(repoSymbolOccurrence.startCol),
              ],
            })
          : [];

      const occurrencePriority = new Map<RepoSymbolOccurrenceRole, number>([
        ["definition", 0],
        ["declaration", 1],
        ["export", 2],
        ["import", 3],
        ["type_reference", 4],
        ["reference", 5],
      ]);
      const bestOccurrenceBySymbolId = new Map<string, (typeof occurrences)[number]>();

      for (const occurrence of occurrences) {
        if (!occurrence.symbolId) {
          continue;
        }

        const current = bestOccurrenceBySymbolId.get(occurrence.symbolId);

        if (!current) {
          bestOccurrenceBySymbolId.set(occurrence.symbolId, occurrence);
          continue;
        }

        const currentPriority =
          occurrencePriority.get(current.occurrenceRole) ?? Number.MAX_SAFE_INTEGER;
        const nextPriority =
          occurrencePriority.get(occurrence.occurrenceRole) ??
          Number.MAX_SAFE_INTEGER;

        if (nextPriority < currentPriority) {
          bestOccurrenceBySymbolId.set(occurrence.symbolId, occurrence);
        }
      }

      const files = fileMatches
        .map((file) => ({
          kind: "file" as const,
          path: file.path,
          language: file.language,
          rank: getSearchRank(file.path, normalizedQuery),
        }))
        .filter((item) => item.rank !== Number.MAX_SAFE_INTEGER)
        .sort((left, right) => {
          if (left.rank !== right.rank) {
            return left.rank - right.rank;
          }

          return left.path.localeCompare(right.path);
        })
        .slice(0, 12)
        .map(({ rank: _rank, ...item }) => item);

      const symbols = symbolMatches
        .filter((symbol) => symbol.file?.path)
        .map((symbol) => {
          const occurrence = bestOccurrenceBySymbolId.get(symbol.id);

          return {
            kind: "symbol" as const,
            id: symbol.id,
            displayName: symbol.displayName,
            symbolKind: symbol.kind,
            filePath: symbol.file?.path ?? "",
            parentSymbolName: symbol.parentSymbol?.displayName ?? null,
            startLine: occurrence?.startLine ?? null,
            startCol: occurrence?.startCol ?? null,
            endLine: occurrence?.endLine ?? null,
            endCol: occurrence?.endCol ?? null,
            rank: getSearchRank(symbol.displayName, normalizedQuery),
          };
        })
        .filter((item) => item.rank !== Number.MAX_SAFE_INTEGER && item.filePath)
        .sort((left, right) => {
          if (left.rank !== right.rank) {
            return left.rank - right.rank;
          }

          const displayNameComparison = left.displayName.localeCompare(
            right.displayName,
          );

          if (displayNameComparison !== 0) {
            return displayNameComparison;
          }

          return left.filePath.localeCompare(right.filePath);
        })
        .slice(0, 12)
        .map(({ rank: _rank, ...item }) => item);

      const exports = exportMatches
        .map((item) => {
          const occurrence = item.symbolId
            ? bestOccurrenceBySymbolId.get(item.symbolId)
            : null;

          return {
            kind: "export" as const,
            id: item.id,
            exportName: item.exportName,
            filePath: item.file.path,
            symbolId: item.symbolId,
            symbolStartLine: occurrence?.startLine ?? null,
            symbolStartCol: occurrence?.startCol ?? null,
            symbolEndLine: occurrence?.endLine ?? null,
            symbolEndCol: occurrence?.endCol ?? null,
            startLine: item.startLine,
            startCol: item.startCol,
            endLine: item.endLine,
            endCol: item.endCol,
            rank: getSearchRank(item.exportName, normalizedQuery),
          };
        })
        .filter((item) => item.rank !== Number.MAX_SAFE_INTEGER)
        .sort((left, right) => {
          if (left.rank !== right.rank) {
            return left.rank - right.rank;
          }

          const exportNameComparison = left.exportName.localeCompare(
            right.exportName,
          );

          if (exportNameComparison !== 0) {
            return exportNameComparison;
          }

          return left.filePath.localeCompare(right.filePath);
        })
        .slice(0, 12)
        .map(({ rank: _rank, ...item }) => item);

      return {
        files,
        symbols,
        exports,
      };
    },
  };
}
