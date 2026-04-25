import { and, asc, eq } from "drizzle-orm";
import { repoImportEdge } from "../../../../db/schema";
import type { ProjectImportEdge } from "../types/repo-parse-graph.types";
import { toImportEdge } from "./utils";

type Database = typeof import("../../../../db/index.ts").db;

export function createImportEdgeQueryService(database: Database) {
  return {
    async listImportEdges(
      projectImportId: string,
      options?: { includeExternal?: boolean },
    ): Promise<ProjectImportEdge[]> {
      const edges = await database.query.repoImportEdge.findMany({
        where: options?.includeExternal
          ? eq(repoImportEdge.projectImportId, projectImportId)
          : and(
              eq(repoImportEdge.projectImportId, projectImportId),
              eq(repoImportEdge.isResolved, true),
            ),
        with: { sourceFile: true, targetFile: true },
        orderBy: [asc(repoImportEdge.sourceFileId), asc(repoImportEdge.startLine)],
      });

      return edges
        .filter((edge) => options?.includeExternal || edge.targetFile !== null)
        .map(toImportEdge);
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
        with: { sourceFile: true, targetFile: true },
        orderBy: [asc(repoImportEdge.startLine), asc(repoImportEdge.startCol)],
      });

      return edges.map(toImportEdge);
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
        with: { sourceFile: true, targetFile: true },
        orderBy: [asc(repoImportEdge.startLine), asc(repoImportEdge.startCol)],
      });

      return edges
        .filter((edge) => edge.sourceFile !== null && edge.targetFile !== null)
        .map(toImportEdge)
        .sort((left, right) => {
          const pathComparison = left.sourceFilePath.localeCompare(right.sourceFilePath);
          if (pathComparison !== 0) return pathComparison;
          if (left.startLine !== right.startLine) return left.startLine - right.startLine;
          return left.startCol - right.startCol;
        });
    },
  };
}
