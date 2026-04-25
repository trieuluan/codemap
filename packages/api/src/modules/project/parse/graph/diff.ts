import { eq } from "drizzle-orm";
import { repoFile, repoSymbol } from "../../../../db/schema";
import type { ProjectImportDiff } from "../types/repo-parse-graph.types";

type Database = typeof import("../../../../db/index.ts").db;

export function createDiffService(database: Database) {
  return {
    async compareImports(
      previousProjectImportId: string,
      currentProjectImportId: string,
    ): Promise<ProjectImportDiff> {
      const [previousFiles, currentFiles, previousSymbols, currentSymbols] = await Promise.all([
        database.query.repoFile.findMany({ where: eq(repoFile.projectImportId, previousProjectImportId) }),
        database.query.repoFile.findMany({ where: eq(repoFile.projectImportId, currentProjectImportId) }),
        database.query.repoSymbol.findMany({ where: eq(repoSymbol.projectImportId, previousProjectImportId) }),
        database.query.repoSymbol.findMany({ where: eq(repoSymbol.projectImportId, currentProjectImportId) }),
      ]);

      const previousFileByPath = new Map(previousFiles.map((file) => [file.path, file] as const));
      const currentFileByPath = new Map(currentFiles.map((file) => [file.path, file] as const));

      const addedFiles = currentFiles.filter((file) => !previousFileByPath.has(file.path));
      const removedFiles = previousFiles.filter((file) => !currentFileByPath.has(file.path));
      const changedFiles = currentFiles.flatMap((file) => {
        const previousFile = previousFileByPath.get(file.path);
        if (!previousFile) return [];
        if (
          previousFile.contentSha256 === file.contentSha256 &&
          previousFile.sizeBytes === file.sizeBytes &&
          previousFile.parseStatus === file.parseStatus
        ) {
          return [];
        }
        return [{ current: file, previous: previousFile }];
      });

      const previousSymbolKeys = new Set(
        previousSymbols
          .map((symbol) => symbol.stableSymbolKey ?? symbol.localSymbolKey)
          .filter((key): key is string => Boolean(key)),
      );
      const currentSymbolKeys = new Set(
        currentSymbols
          .map((symbol) => symbol.stableSymbolKey ?? symbol.localSymbolKey)
          .filter((key): key is string => Boolean(key)),
      );

      return {
        addedFiles,
        removedFiles,
        changedFiles,
        addedSymbolKeys: [...currentSymbolKeys].filter((key) => !previousSymbolKeys.has(key)),
        removedSymbolKeys: [...previousSymbolKeys].filter((key) => !currentSymbolKeys.has(key)),
      };
    },
  };
}
