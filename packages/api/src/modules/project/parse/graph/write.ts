import { and, eq } from "drizzle-orm";
import {
  repoExport,
  repoExternalSymbol,
  repoFile,
  repoImportEdge,
  repoParseIssue,
  repoSymbol,
  repoSymbolOccurrence,
  repoSymbolRelationship,
} from "../../../../db/schema";
import type {
  ProjectFileRecord,
  RepoExportInsert,
  RepoExternalSymbolInsert,
  RepoFileInsert,
  RepoImportEdgeInsert,
  RepoParseIssueInsert,
  RepoSymbolInsert,
  RepoSymbolOccurrenceInsert,
  RepoSymbolRelationshipInsert,
} from "../../../../db/schema/repo-parse-schema";

type Database = typeof import("../../../../db/index.ts").db;

export function createWriteService(database: Database) {
  return {
    async saveFiles(files: RepoFileInsert[]) {
      if (files.length === 0) {
        return [] as ProjectFileRecord[];
      }

      return database.insert(repoFile).values(files).returning();
    },

    async clearImportData(projectImportId: string) {
      await database.transaction(async (tx) => {
        await tx.delete(repoExport).where(eq(repoExport.projectImportId, projectImportId));
        await tx.delete(repoSymbolRelationship).where(eq(repoSymbolRelationship.projectImportId, projectImportId));
        await tx.delete(repoSymbolOccurrence).where(eq(repoSymbolOccurrence.projectImportId, projectImportId));
        await tx.delete(repoImportEdge).where(eq(repoImportEdge.projectImportId, projectImportId));
        await tx.delete(repoExternalSymbol).where(eq(repoExternalSymbol.projectImportId, projectImportId));
        await tx.delete(repoParseIssue).where(eq(repoParseIssue.projectImportId, projectImportId));
        await tx.delete(repoSymbol).where(eq(repoSymbol.projectImportId, projectImportId));
        await tx.delete(repoFile).where(eq(repoFile.projectImportId, projectImportId));
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

      return database.insert(repoSymbolRelationship).values(relationships).returning();
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

      return database.insert(repoExternalSymbol).values(symbols).onConflictDoNothing().returning();
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
        relationships: Array<{ fromSymbolLocalKey: string; toSymbolName: string; relationshipKind: RepoSymbolRelationshipInsert["relationshipKind"] }>;
        issues: RepoParseIssueInsert[];
        externalSymbols: RepoExternalSymbolInsert[];
      },
    ): Promise<ProjectFileRecord> {
      const fileId = fileRecord.id;

      await database.transaction(async (tx) => {
        await tx.delete(repoExport).where(eq(repoExport.fileId, fileId));
        await tx.delete(repoImportEdge).where(eq(repoImportEdge.sourceFileId, fileId));
        await tx.delete(repoSymbol).where(eq(repoSymbol.fileId, fileId));
        await tx.delete(repoParseIssue).where(
          and(
            eq(repoParseIssue.projectImportId, projectImportId),
            eq(repoParseIssue.fileId, fileId),
          ),
        );
      });

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
        const location = (symbol.extraJson as { line: number; col: number } | null) ?? null;

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

      if (data.relationships.length > 0) {
        const relationshipDrafts = data.relationships
          .map((r) => {
            const fromSymbolId = symbolIdByLocalKey.get(r.fromSymbolLocalKey);
            if (!fromSymbolId) return null;
            return {
              projectImportId,
              fromSymbolId,
              toSymbolId: null,
              toExternalSymbolKey: r.toSymbolName,
              relationshipKind: r.relationshipKind,
              isReference: false,
              isImplementation: r.relationshipKind === "implements",
              isTypeDefinition: false,
              isDefinition: false,
              extraJson: null,
            };
          })
          .filter((r): r is Exclude<typeof r, null> => r !== null);

        if (relationshipDrafts.length > 0) {
          await database.insert(repoSymbolRelationship).values(relationshipDrafts);
        }
      }

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

      if (data.issues.length > 0) {
        await database.insert(repoParseIssue).values(data.issues);
      }

      if (data.externalSymbols.length > 0) {
        await database.insert(repoExternalSymbol).values(data.externalSymbols).onConflictDoNothing();
      }

      return updatedFile;
    },
  };
}
