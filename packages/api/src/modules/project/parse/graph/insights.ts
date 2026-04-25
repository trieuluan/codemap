import { and, asc, eq } from "drizzle-orm";
import { repoFile, repoImportEdge, repoSymbol } from "../../../../db/schema";
import type {
  ProjectAnalysisSummary,
  ProjectInsightsCycleCandidate,
  ProjectInsightsSummary,
} from "../types/repo-parse-graph.types";
import { buildEntryLikeReason, MONOREPO_ROOT_SEGMENTS, tarjanSCC, toPathBaseName, toTopLevelFolder } from "./utils";

type Database = typeof import("../../../../db/index.ts").db;

export function createInsightsService(database: Database) {
  return {
    async getProjectAnalysisSummary(projectImportId: string): Promise<ProjectAnalysisSummary> {
      const [files, importEdges, symbols] = await Promise.all([
        database.query.repoFile.findMany({
          where: and(eq(repoFile.projectImportId, projectImportId), eq(repoFile.isIgnored, false)),
          orderBy: [asc(repoFile.path)],
        }),
        database.query.repoImportEdge.findMany({
          where: eq(repoImportEdge.projectImportId, projectImportId),
          with: { sourceFile: true, targetFile: true },
        }),
        database.query.repoSymbol.findMany({
          where: eq(repoSymbol.projectImportId, projectImportId),
          columns: { id: true },
        }),
      ]);

      const fileStats = new Map<string, { path: string; outgoingCount: number; incomingCount: number }>();
      const folderCounts = new Map<string, number>();
      const languageCounts = new Map<string, number>();

      for (const file of files) {
        fileStats.set(file.id, { path: file.path, outgoingCount: 0, incomingCount: 0 });

        if (file.isParseable) {
          const topFolder = file.path.includes("/") ? file.path.split("/")[0] || "(root)" : "(root)";
          folderCounts.set(topFolder, (folderCounts.get(topFolder) ?? 0) + 1);

          const language = file.language ?? "Unknown";
          languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
        }
      }

      for (const edge of importEdges) {
        const sourceStats = fileStats.get(edge.sourceFileId);
        if (sourceStats) sourceStats.outgoingCount += 1;

        if (edge.targetFileId) {
          const targetStats = fileStats.get(edge.targetFileId);
          if (targetStats) targetStats.incomingCount += 1;
        }
      }

      return {
        topFilesByDependencies: Array.from(fileStats.values())
          .filter((item) => item.outgoingCount > 0 || item.incomingCount > 0)
          .sort((left, right) => {
            const rightTotal = right.outgoingCount + right.incomingCount;
            const leftTotal = left.outgoingCount + left.incomingCount;
            if (leftTotal !== rightTotal) return rightTotal - leftTotal;
            return left.path.localeCompare(right.path);
          })
          .slice(0, 8),
        topFolders: Array.from(folderCounts.entries())
          .map(([folder, sourceFileCount]) => ({ folder, sourceFileCount }))
          .sort((left, right) => {
            if (left.sourceFileCount !== right.sourceFileCount) return right.sourceFileCount - left.sourceFileCount;
            return left.folder.localeCompare(right.folder);
          })
          .slice(0, 8),
        sourceFileDistribution: Array.from(languageCounts.entries())
          .map(([language, fileCount]) => ({ language, fileCount }))
          .sort((left, right) => {
            if (left.fileCount !== right.fileCount) return right.fileCount - left.fileCount;
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

    async getProjectInsights(projectImportId: string): Promise<ProjectInsightsSummary> {
      const [files, importEdges, symbols] = await Promise.all([
        database.query.repoFile.findMany({
          where: and(eq(repoFile.projectImportId, projectImportId), eq(repoFile.isIgnored, false)),
          orderBy: [asc(repoFile.path)],
        }),
        database.query.repoImportEdge.findMany({
          where: eq(repoImportEdge.projectImportId, projectImportId),
          with: { sourceFile: true, targetFile: true },
        }),
        database.query.repoSymbol.findMany({
          where: eq(repoSymbol.projectImportId, projectImportId),
          columns: { id: true },
        }),
      ]);

      const fileStats = new Map<string, { id: string; path: string; language: string | null; incomingCount: number; outgoingCount: number; isParseable: boolean }>();
      const folderCounts = new Map<string, number>();
      const internalAdjacency = new Map<string, Set<string>>();
      const internalEdgeCounts = new Map<string, number>();

      for (const file of files) {
        fileStats.set(file.id, { id: file.id, path: file.path, language: file.language, incomingCount: 0, outgoingCount: 0, isParseable: file.isParseable });

        if (file.isParseable) {
          const topFolder = toTopLevelFolder(file.path, true);
          folderCounts.set(topFolder, (folderCounts.get(topFolder) ?? 0) + 1);
        }
      }

      for (const edge of importEdges) {
        if (!edge.targetFileId) continue;

        const sourceStats = fileStats.get(edge.sourceFileId);
        const targetStats = fileStats.get(edge.targetFileId);
        if (!sourceStats || !targetStats) continue;

        sourceStats.outgoingCount += 1;
        targetStats.incomingCount += 1;

        const adj = internalAdjacency.get(edge.sourceFileId) ?? new Set<string>();
        adj.add(edge.targetFileId);
        internalAdjacency.set(edge.sourceFileId, adj);
      }

      for (const [sourceId, targetIds] of internalAdjacency.entries()) {
        for (const targetId of targetIds) {
          const key = `${sourceId}->${targetId}`;
          internalEdgeCounts.set(key, (internalEdgeCounts.get(key) ?? 0) + 1);
        }
      }

      const sourceFiles = Array.from(fileStats.values()).filter((item) => item.isParseable);

      const topFilesByImportCount = [...sourceFiles]
        .filter((item) => item.outgoingCount > 0)
        .sort((left, right) => {
          if (left.outgoingCount !== right.outgoingCount) return right.outgoingCount - left.outgoingCount;
          if (left.incomingCount !== right.incomingCount) return right.incomingCount - left.incomingCount;
          return left.path.localeCompare(right.path);
        })
        .slice(0, 12)
        .map(({ path, language, incomingCount, outgoingCount }) => ({ path, language, incomingCount, outgoingCount }));

      const topFilesByInboundDependencyCount = [...sourceFiles]
        .filter((item) => item.incomingCount > 0)
        .sort((left, right) => {
          if (left.incomingCount !== right.incomingCount) return right.incomingCount - left.incomingCount;
          if (left.outgoingCount !== right.outgoingCount) return right.outgoingCount - left.outgoingCount;
          return left.path.localeCompare(right.path);
        })
        .slice(0, 12)
        .map(({ path, language, incomingCount, outgoingCount }) => ({ path, language, incomingCount, outgoingCount }));

      const orphanFiles = [...sourceFiles]
        .filter((item) => item.incomingCount === 0 && item.outgoingCount === 0)
        .sort((left, right) => left.path.localeCompare(right.path))
        .slice(0, 24)
        .map(({ path, language, incomingCount, outgoingCount }) => ({ path, language, incomingCount, outgoingCount }));

      const entryLikeFiles = [...sourceFiles]
        .map((item) => {
          const baseName = toPathBaseName(item.path).toLowerCase();
          const normalizedPath = item.path.toLowerCase();
          const disqualifyingPattern =
            normalizedPath.includes(".test.") || normalizedPath.includes(".spec.") ||
            normalizedPath.includes(".stories.") || normalizedPath.includes("/test/") ||
            normalizedPath.includes("/tests/") || normalizedPath.includes("/__tests__/") ||
            normalizedPath.includes("/mocks/") || normalizedPath.includes("/mock/") ||
            normalizedPath.includes("/fixtures/") || normalizedPath.includes("/utils/") ||
            normalizedPath.includes("/helpers/") || normalizedPath.includes("/constants/");

          let score = 0;

          if (["main", "app", "server", "cli", "worker", "entry", "bootstrap"].includes(baseName)) {
            score += 5;
          } else if (baseName === "index" && item.outgoingCount >= 3 && (item.path.startsWith("src/") || item.path.startsWith("app/") || !item.path.includes("/"))) {
            score += 3;
          }

          const pathParts = item.path.split("/");
          const isMonorepoSrc = MONOREPO_ROOT_SEGMENTS.has(pathParts[0] ?? "") && pathParts[2] === "src" && pathParts.length === 4;

          if (!item.path.includes("/")) {
            score += 2;
          } else if (item.path.startsWith("src/") || item.path.startsWith("app/") || isMonorepoSrc) {
            score += 2;
          }

          if (item.outgoingCount >= 5) score += 3;
          else if (item.outgoingCount >= 3) score += 2;

          if (item.incomingCount === 0) score += 1;
          if (disqualifyingPattern) score -= 4;

          return {
            ...item,
            score,
            reason: score >= 5 ? buildEntryLikeReason(baseName, item.path, item.outgoingCount, item.incomingCount) : "",
          };
        })
        .filter((item) => item.score >= 5 && item.reason)
        .sort((left, right) => {
          if (left.score !== right.score) return right.score - left.score;
          if (left.outgoingCount !== right.outgoingCount) return right.outgoingCount - left.outgoingCount;
          return left.path.localeCompare(right.path);
        })
        .slice(0, 12)
        .map(({ path, language, incomingCount, outgoingCount, score, reason }) => ({ path, language, incomingCount, outgoingCount, score, reason }));

      // Direct cycle candidates
      const directCycleCandidates = new Map<string, ProjectInsightsCycleCandidate>();
      for (const [sourceId, targetIds] of internalAdjacency.entries()) {
        for (const targetId of targetIds) {
          if (!internalAdjacency.get(targetId)?.has(sourceId)) continue;

          const sourcePath = fileStats.get(sourceId)?.path;
          const targetPath = fileStats.get(targetId)?.path;
          if (!sourcePath || !targetPath) continue;

          const sortedPaths = [sourcePath, targetPath].sort((left, right) => left.localeCompare(right));
          const key = sortedPaths.join("::");
          if (directCycleCandidates.has(key)) continue;

          directCycleCandidates.set(key, {
            kind: "direct",
            paths: sortedPaths,
            edgeCount: (internalEdgeCounts.get(`${sourceId}->${targetId}`) ?? 1) + (internalEdgeCounts.get(`${targetId}->${sourceId}`) ?? 1),
            summary: `${sortedPaths[0]} and ${sortedPaths[1]} import each other`,
          });
        }
      }

      const sccs = tarjanSCC(sourceFiles.map((f) => f.id), internalAdjacency);

      const circularDependencyCandidates: ProjectInsightsCycleCandidate[] = [
        ...Array.from(directCycleCandidates.values()),
        ...sccs
          .filter((component) => component.length >= 3 && component.length <= 5)
          .map((component) => {
            const paths = component
              .map((fileId) => fileStats.get(fileId)?.path)
              .filter((p): p is string => Boolean(p))
              .sort((left, right) => left.localeCompare(right));

            const componentSet = new Set(component);
            let edgeCount = 0;
            for (const fileId of component) {
              for (const neighborId of internalAdjacency.get(fileId) ?? []) {
                if (componentSet.has(neighborId)) edgeCount += 1;
              }
            }

            return { kind: "scc" as const, paths, edgeCount, summary: `${paths.length}-file dependency cycle candidate` };
          }),
      ]
        .sort((left, right) => {
          if (left.kind !== right.kind) return left.kind === "direct" ? -1 : 1;
          if (left.paths.length !== right.paths.length) return left.paths.length - right.paths.length;
          if (left.edgeCount !== right.edgeCount) return right.edgeCount - left.edgeCount;
          return left.paths.join("::").localeCompare(right.paths.join("::"));
        })
        .slice(0, 12);

      return {
        topFilesByImportCount,
        topFilesByInboundDependencyCount,
        topFoldersBySourceFileCount: Array.from(folderCounts.entries())
          .map(([folder, sourceFileCount]) => ({ folder, sourceFileCount }))
          .sort((left, right) => {
            if (left.sourceFileCount !== right.sourceFileCount) return right.sourceFileCount - left.sourceFileCount;
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
  };
}
