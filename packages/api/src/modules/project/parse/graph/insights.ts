import { and, asc, eq } from "drizzle-orm";
import { repoFile, repoImportEdge, repoSymbol } from "../../../../db/schema";
import type {
  ProjectAnalysisSummary,
  ProjectInsightsCycleCandidate,
  ProjectInsightsFocusedEdgeFile,
  ProjectInsightsFocusedFile,
  ProjectInsightsRecommendation,
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

    async getProjectInsights(
      projectImportId: string,
      focus?: { file?: string; symbol?: string },
    ): Promise<ProjectInsightsSummary> {
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
      const languageCounts = new Map<string, number>();
      const parseStatusCounts = new Map<string, number>();
      const internalAdjacency = new Map<string, Set<string>>();
      const internalEdgeCounts = new Map<string, number>();
      let unresolvedImportCount = 0;
      let externalImportCount = 0;

      for (const file of files) {
        fileStats.set(file.id, { id: file.id, path: file.path, language: file.language, incomingCount: 0, outgoingCount: 0, isParseable: file.isParseable });
        parseStatusCounts.set(file.parseStatus, (parseStatusCounts.get(file.parseStatus) ?? 0) + 1);

        if (file.isParseable) {
          const topFolder = toTopLevelFolder(file.path, true);
          folderCounts.set(topFolder, (folderCounts.get(topFolder) ?? 0) + 1);

          const language = file.language ?? "Unknown";
          languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
        }
      }

      for (const edge of importEdges) {
        if (!edge.isResolved || edge.resolutionKind === "unresolved") {
          unresolvedImportCount += 1;
        }

        if (
          edge.resolutionKind === "package" ||
          edge.resolutionKind === "builtin" ||
          Boolean(edge.targetExternalSymbolKey)
        ) {
          externalImportCount += 1;
        }

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

      const languageDistribution = Array.from(languageCounts.entries())
        .map(([language, fileCount]) => ({ language, fileCount }))
        .sort((left, right) => {
          if (left.fileCount !== right.fileCount) return right.fileCount - left.fileCount;
          return left.language.localeCompare(right.language);
        });

      const parseStatusBreakdown = Array.from(parseStatusCounts.entries())
        .map(([status, fileCount]) => ({
          status: status as "parsed" | "skipped" | "too_large" | "binary" | "unsupported" | "error",
          fileCount,
        }))
        .sort((left, right) => {
          if (left.fileCount !== right.fileCount) return right.fileCount - left.fileCount;
          return left.status.localeCompare(right.status);
        });

      const focusedFile = buildFocusedFile({
        focusFile: focus?.file,
        focusSymbol: focus?.symbol,
        fileStats,
        importEdges,
        entryLikeFiles,
        circularDependencyCandidates,
      });

      const recommendations = buildRecommendations({
        circularDependencyCandidates,
        topFilesByImportCount,
        orphanFiles,
        parseStatusBreakdown,
        focusedFile,
      });

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
        languageDistribution,
        parseStatusBreakdown,
        unresolvedImportCount,
        externalImportCount,
        focusedFile,
        recommendations,
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

function buildFocusedFile({
  focusFile,
  focusSymbol,
  fileStats,
  importEdges,
  entryLikeFiles,
  circularDependencyCandidates,
}: {
  focusFile?: string;
  focusSymbol?: string;
  fileStats: Map<
    string,
    {
      id: string;
      path: string;
      language: string | null;
      incomingCount: number;
      outgoingCount: number;
      isParseable: boolean;
    }
  >;
  importEdges: Array<{
    sourceFileId: string;
    targetFileId: string | null;
    moduleSpecifier: string;
    importKind: string;
    importedNames: string[];
    isTypeOnly: boolean;
    isResolved: boolean;
    resolutionKind: string;
    sourceFile: { path: string; language: string | null } | null;
    targetFile: { path: string; language: string | null } | null;
  }>;
  entryLikeFiles: Array<{
    path: string;
    language: string | null;
    incomingCount: number;
    outgoingCount: number;
    score: number;
    reason: string;
  }>;
  circularDependencyCandidates: ProjectInsightsCycleCandidate[];
}): ProjectInsightsFocusedFile | null {
  if (!focusFile) {
    return null;
  }

  const stats = Array.from(fileStats.values()).find(
    (item) => item.path === focusFile,
  );

  if (!stats) {
    return null;
  }

  const entryLike = entryLikeFiles.find((item) => item.path === focusFile);
  const cycles = circularDependencyCandidates.filter((item) =>
    item.paths.includes(focusFile),
  );

  return {
    path: stats.path,
    language: stats.language,
    incomingCount: stats.incomingCount,
    outgoingCount: stats.outgoingCount,
    symbolName: focusSymbol ?? null,
    isOrphan: stats.incomingCount === 0 && stats.outgoingCount === 0,
    isEntryLike: Boolean(entryLike),
    entryLikeScore: entryLike?.score ?? null,
    entryLikeReason: entryLike?.reason ?? null,
    cycles,
    directImporters: importEdges
      .filter((edge) => edge.targetFileId === stats.id && edge.sourceFile)
      .map((edge) =>
        toFocusedEdgeFile(edge, edge.sourceFile!, fileStats),
      )
      .sort(compareFocusedEdgeFiles)
      .slice(0, 12),
    directDependencies: importEdges
      .filter((edge) => edge.sourceFileId === stats.id && edge.targetFile)
      .map((edge) =>
        toFocusedEdgeFile(edge, edge.targetFile!, fileStats),
      )
      .sort(compareFocusedEdgeFiles)
      .slice(0, 12),
  };
}

function toFocusedEdgeFile(
  edge: {
    moduleSpecifier: string;
    importKind: string;
    importedNames: string[];
    isTypeOnly: boolean;
    isResolved: boolean;
    resolutionKind: string;
  },
  file: { path: string; language: string | null },
  fileStats: Map<
    string,
    {
      path: string;
      incomingCount: number;
      outgoingCount: number;
    }
  >,
): ProjectInsightsFocusedEdgeFile {
  const stats = Array.from(fileStats.values()).find(
    (item) => item.path === file.path,
  );

  return {
    path: file.path,
    language: file.language,
    incomingCount: stats?.incomingCount ?? 0,
    outgoingCount: stats?.outgoingCount ?? 0,
    moduleSpecifier: edge.moduleSpecifier,
    importKind: edge.importKind,
    importedNames: edge.importedNames,
    isTypeOnly: edge.isTypeOnly,
    isResolved: edge.isResolved,
    resolutionKind: edge.resolutionKind,
  };
}

function compareFocusedEdgeFiles(
  left: ProjectInsightsFocusedEdgeFile,
  right: ProjectInsightsFocusedEdgeFile,
) {
  return left.path.localeCompare(right.path);
}

function buildRecommendations({
  circularDependencyCandidates,
  topFilesByImportCount,
  orphanFiles,
  parseStatusBreakdown,
  focusedFile,
}: {
  circularDependencyCandidates: ProjectInsightsCycleCandidate[];
  topFilesByImportCount: Array<{ path: string; outgoingCount: number }>;
  orphanFiles: Array<{ path: string }>;
  parseStatusBreakdown: Array<{ status: string; fileCount: number }>;
  focusedFile: ProjectInsightsFocusedFile | null;
}): ProjectInsightsRecommendation[] {
  const recommendations: ProjectInsightsRecommendation[] = [];
  if (focusedFile) {
    recommendations.push({
      id: "inspect-focused-file",
      title: "Inspect focused file relationships",
      description: `${focusedFile.path} has ${focusedFile.incomingCount} incoming and ${focusedFile.outgoingCount} outgoing internal dependencies.`,
      severity: "info",
      action: "inspect_focused_file",
      href: null,
    });

    if (focusedFile.isOrphan) {
      recommendations.push({
        id: "review-focused-orphan",
        title: "Review orphan status",
        description: "This file has no indexed internal importers or dependencies. Confirm whether it is generated, unused, or loaded outside static imports.",
        severity: "info",
        action: "review_focused_orphan",
        href: null,
      });
    }

    if (focusedFile.isEntryLike) {
      recommendations.push({
        id: "review-focused-entry",
        title: "Review entry surface",
        description: focusedFile.entryLikeReason
          ? `${focusedFile.entryLikeReason}. Check whether its dependencies match the intended app boundary.`
          : "This file looks like an entry surface. Check whether its dependencies match the intended app boundary.",
        severity: "info",
        action: "review_focused_entry",
        href: null,
      });
    }

    if (focusedFile.cycles.length > 0) {
      recommendations.push({
        id: "review-focused-cycle",
        title: "Review focused cycle",
        description: `${focusedFile.cycles.length} cycle candidate${focusedFile.cycles.length === 1 ? "" : "s"} include this file. Start by inspecting direct imports around this node.`,
        severity: "critical",
        action: "review_focused_cycle",
        href: null,
      });
    }

    if (focusedFile.outgoingCount >= 8) {
      recommendations.push({
        id: "inspect-focused-fan-out",
        title: "Inspect focused file fan-out",
        description: `This file imports ${focusedFile.outgoingCount} internal files and may be coordinating too many responsibilities.`,
        severity: "warning",
        action: "inspect_focused_fan_out",
        href: null,
      });
    }

    if (focusedFile.incomingCount >= 8) {
      recommendations.push({
        id: "inspect-focused-dependents",
        title: "Inspect focused file dependents",
        description: `${focusedFile.incomingCount} internal files depend on this file. Review callers before changing its public surface.`,
        severity: "warning",
        action: "inspect_focused_dependents",
        href: null,
      });
    }

    return recommendations.slice(0, 4);
  }

  const parseProblemCount = parseStatusBreakdown
    .filter((item) => item.status !== "parsed" && item.status !== "skipped")
    .reduce((total, item) => total + item.fileCount, 0);

  if (circularDependencyCandidates.length > 0) {
    recommendations.push({
      id: "review-cycles",
      title: "Review circular dependencies",
      description: `${circularDependencyCandidates.length} cycle candidate${circularDependencyCandidates.length === 1 ? "" : "s"} found. Start with direct cycles before larger SCCs.`,
      severity: "critical",
      action: "review_cycles",
      href: null,
    });
  }

  const highFanOut = topFilesByImportCount[0];
  if (highFanOut && highFanOut.outgoingCount >= 8) {
    recommendations.push({
      id: "inspect-high-fan-out",
      title: "Inspect high fan-out files",
      description: `${highFanOut.path} imports ${highFanOut.outgoingCount} internal files and may be doing too much.`,
      severity: "warning",
      action: "inspect_high_fan_out",
      href: null,
    });
  }

  if (orphanFiles.length > 0) {
    recommendations.push({
      id: "inspect-orphans",
      title: "Inspect orphan files",
      description: `${orphanFiles.length} parseable file${orphanFiles.length === 1 ? "" : "s"} in the top orphan list have no internal dependency edges.`,
      severity: "info",
      action: "inspect_orphans",
      href: null,
    });
  }

  if (parseProblemCount > 0) {
    recommendations.push({
      id: "review-parse-quality",
      title: "Review parse quality",
      description: `${parseProblemCount} file${parseProblemCount === 1 ? "" : "s"} were indexed with a non-ideal parse status.`,
      severity: "warning",
      action: "review_parse_quality",
      href: null,
    });
  }

  return recommendations.slice(0, 4);
}
