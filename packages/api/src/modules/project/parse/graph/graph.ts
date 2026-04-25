import { and, asc, eq } from "drizzle-orm";
import { repoFile, repoImportEdge } from "../../../../db/schema";
import type {
  ProjectGraphCycle,
  ProjectGraphData,
  ProjectGraphEdge,
  ProjectGraphFolderEdge,
  ProjectGraphNode,
} from "../types/repo-parse-graph.types";
import { tarjanSCC, toTopLevelFolder } from "./utils";

type Database = typeof import("../../../../db/index.ts").db;

export function createGraphService(database: Database) {
  return {
    async getProjectGraph(projectImportId: string): Promise<ProjectGraphData> {
      const [files, importEdges] = await Promise.all([
        database.query.repoFile.findMany({
          where: and(eq(repoFile.projectImportId, projectImportId), eq(repoFile.isIgnored, false)),
          orderBy: [asc(repoFile.path)],
        }),
        database.query.repoImportEdge.findMany({
          where: eq(repoImportEdge.projectImportId, projectImportId),
          with: { sourceFile: true, targetFile: true },
        }),
      ]);

      const fileStats = new Map<string, { id: string; path: string; language: string | null; incomingCount: number; outgoingCount: number; isParseable: boolean }>();

      for (const file of files) {
        fileStats.set(file.id, { id: file.id, path: file.path, language: file.language, incomingCount: 0, outgoingCount: 0, isParseable: file.isParseable });
      }

      const seenEdges = new Set<string>();
      const graphEdges: ProjectGraphEdge[] = [];
      const internalAdjacency = new Map<string, Set<string>>();
      const folderStats = new Map<string, { id: string; folder: string; fileCount: number; sourceFileCount: number; incomingCount: number; outgoingCount: number; internalEdgeCount: number }>();
      const folderEdgeCounts = new Map<string, ProjectGraphFolderEdge>();

      const ensureFolderStats = (folder: string) => {
        const existing = folderStats.get(folder);
        if (existing) return existing;
        const created = { id: `folder:${folder}`, folder, fileCount: 0, sourceFileCount: 0, incomingCount: 0, outgoingCount: 0, internalEdgeCount: 0 };
        folderStats.set(folder, created);
        return created;
      };

      for (const edge of importEdges) {
        if (!edge.targetFileId) continue;

        const sourceStats = fileStats.get(edge.sourceFileId);
        const targetStats = fileStats.get(edge.targetFileId);
        if (!sourceStats || !targetStats) continue;

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

        const adj = internalAdjacency.get(edge.sourceFileId) ?? new Set<string>();
        adj.add(edge.targetFileId);
        internalAdjacency.set(edge.sourceFileId, adj);

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
            folderEdgeCounts.set(folderEdgeKey, { id: folderEdgeKey, source: sourceFolderId, target: targetFolderId, edgeCount: 1 });
          }
        }
      }

      const sourceFiles = Array.from(fileStats.values()).filter((item) => item.isParseable);
      const sccs = tarjanSCC(sourceFiles.map((f) => f.id), internalAdjacency);

      const cycles: ProjectGraphCycle[] = [];
      const seenDirectCycleKeys = new Set<string>();

      for (const [sourceId, targetIds] of internalAdjacency.entries()) {
        for (const targetId of targetIds) {
          if (!internalAdjacency.get(targetId)?.has(sourceId)) continue;

          const sourcePath = fileStats.get(sourceId)?.path;
          const targetPath = fileStats.get(targetId)?.path;
          if (!sourcePath || !targetPath) continue;

          const sortedPaths = [sourcePath, targetPath].sort((a, b) => a.localeCompare(b));
          const key = sortedPaths.join("::");
          if (seenDirectCycleKeys.has(key)) continue;
          seenDirectCycleKeys.add(key);

          const sortedIds = sortedPaths.map((p) => Array.from(fileStats.values()).find((f) => f.path === p)?.id ?? "");
          cycles.push({ kind: "direct", paths: sortedPaths, nodeIds: sortedIds.filter(Boolean) });
        }
      }

      for (const component of sccs) {
        if (component.length < 3) continue;
        const paths = component
          .map((fileId) => fileStats.get(fileId)?.path)
          .filter((p): p is string => Boolean(p))
          .sort((a, b) => a.localeCompare(b));
        cycles.push({ kind: "scc", paths, nodeIds: component });
      }

      const nodes: ProjectGraphNode[] = Array.from(fileStats.values()).map((file) => {
        const lastSlash = file.path.lastIndexOf("/");
        const dirPath = lastSlash >= 0 ? file.path.slice(0, lastSlash) : "";
        const folder = toTopLevelFolder(file.path);
        const stats = ensureFolderStats(folder);

        stats.fileCount += 1;
        if (file.isParseable) stats.sourceFileCount += 1;

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
          if (left.sourceFileCount !== right.sourceFileCount) return right.sourceFileCount - left.sourceFileCount;
          return left.folder.localeCompare(right.folder);
        }),
        folderEdges: Array.from(folderEdgeCounts.values()).sort((left, right) => {
          if (left.edgeCount !== right.edgeCount) return right.edgeCount - left.edgeCount;
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
  };
}
