import { and, asc, desc, eq } from "drizzle-orm";
import {
  projectImport,
  repoExport,
  repoExportKindEnum,
  repoExternalSymbol,
  repoFile,
  repoFileParseStatusEnum,
  repoImportEdge,
  repoImportKindEnum,
  repoImportResolutionKindEnum,
  repoParseIssueSeverityEnum,
  repoParseStatusEnum,
  repoParseIssue,
  repoSymbol,
  repoSymbolKindEnum,
  repoSymbolOccurrence,
  repoSymbolOccurrenceRoleEnum,
  repoSymbolRelationship,
  repoSymbolRelationshipKindEnum,
  repoSymbolVisibilityEnum,
} from "../../db/schema";

type Database = typeof import("../../db").db;

type EnumValue<TEnum extends { enumValues: readonly string[] }> =
  TEnum["enumValues"][number];

export type RepoParseStatus = EnumValue<typeof repoParseStatusEnum>;
export type RepoFileParseStatus = EnumValue<typeof repoFileParseStatusEnum>;
export type RepoSymbolKind = EnumValue<typeof repoSymbolKindEnum>;
export type RepoSymbolVisibility = EnumValue<typeof repoSymbolVisibilityEnum>;
export type RepoSymbolOccurrenceRole =
  EnumValue<typeof repoSymbolOccurrenceRoleEnum>;
export type RepoSymbolRelationshipKind =
  EnumValue<typeof repoSymbolRelationshipKindEnum>;
export type RepoImportKind = EnumValue<typeof repoImportKindEnum>;
export type RepoImportResolutionKind =
  EnumValue<typeof repoImportResolutionKindEnum>;
export type RepoExportKind = EnumValue<typeof repoExportKindEnum>;
export type RepoParseIssueSeverity =
  EnumValue<typeof repoParseIssueSeverityEnum>;

export type ProjectFileRecord = typeof repoFile.$inferSelect;
export type RepoFileInsert = typeof repoFile.$inferInsert;
export type RepoSymbolInsert = typeof repoSymbol.$inferInsert;
export type RepoSymbolOccurrenceInsert = typeof repoSymbolOccurrence.$inferInsert;
export type RepoSymbolRelationshipInsert =
  typeof repoSymbolRelationship.$inferInsert;
export type RepoImportEdgeInsert = typeof repoImportEdge.$inferInsert;
export type RepoExportInsert = typeof repoExport.$inferInsert;
export type RepoParseIssueInsert = typeof repoParseIssue.$inferInsert;
export type RepoExternalSymbolInsert = typeof repoExternalSymbol.$inferInsert;

export interface ProjectImportEdge {
  id: string;
  projectImportId: string;
  sourceFileId: string;
  sourceFilePath: string;
  targetFileId: string | null;
  targetFilePath: string | null;
  targetPathText: string | null;
  targetExternalSymbolKey: string | null;
  moduleSpecifier: string;
  importKind: RepoImportKind;
  isTypeOnly: boolean;
  isResolved: boolean;
  resolutionKind: RepoImportResolutionKind;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  extraJson: unknown;
  createdAt: Date;
}

export interface ProjectSymbol {
  id: string;
  projectImportId: string;
  fileId: string | null;
  filePath: string | null;
  stableSymbolKey: string | null;
  localSymbolKey: string | null;
  displayName: string;
  kind: RepoSymbolKind;
  language: string | null;
  visibility: RepoSymbolVisibility;
  isExported: boolean;
  isDefaultExport: boolean;
  signature: string | null;
  returnType: string | null;
  parentSymbolId: string | null;
  parentSymbolName: string | null;
  ownerSymbolKey: string | null;
  docJson: unknown;
  typeJson: unknown;
  modifiersJson: unknown;
  extraJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectExportRecord {
  id: string;
  projectImportId: string;
  fileId: string;
  filePath: string;
  symbolId: string | null;
  symbolDisplayName: string | null;
  exportName: string;
  exportKind: RepoExportKind;
  sourceImportEdgeId: string | null;
  sourceModuleSpecifier: string | null;
  targetExternalSymbolKey: string | null;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  extraJson: unknown;
  createdAt: Date;
}

export interface ProjectSymbolRelationshipRecord {
  id: string;
  projectImportId: string;
  fromSymbolId: string;
  fromSymbolName: string;
  toSymbolId: string | null;
  toSymbolName: string | null;
  toExternalSymbolKey: string | null;
  relationshipKind: RepoSymbolRelationshipKind;
  isReference: boolean;
  isImplementation: boolean;
  isTypeDefinition: boolean;
  isDefinition: boolean;
  extraJson: unknown;
  createdAt: Date;
}

export interface ProjectImportDiff {
  addedFiles: ProjectFileRecord[];
  removedFiles: ProjectFileRecord[];
  changedFiles: Array<{
    current: ProjectFileRecord;
    previous: ProjectFileRecord;
  }>;
  addedSymbolKeys: string[];
  removedSymbolKeys: string[];
}

export interface ProjectFileSymbolRecord {
  id: string;
  displayName: string;
  kind: RepoSymbolKind;
  signature: string | null;
  isExported: boolean;
  parentSymbolName: string | null;
  startLine: number | null;
  startCol: number | null;
  endLine: number | null;
  endCol: number | null;
}

export interface ProjectAnalysisSummary {
  topFilesByDependencies: Array<{
    path: string;
    outgoingCount: number;
    incomingCount: number;
  }>;
  topFolders: Array<{
    folder: string;
    sourceFileCount: number;
  }>;
  sourceFileDistribution: Array<{
    language: string;
    fileCount: number;
  }>;
  totals: {
    files: number;
    sourceFiles: number;
    parsedFiles: number;
    dependencies: number;
    symbols: number;
  };
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
  };
}
