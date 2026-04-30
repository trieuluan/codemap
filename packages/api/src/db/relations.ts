import { relations } from "drizzle-orm";
import { user } from "./schema/auth-schema";
import {
  project,
  projectImport,
  projectMapSnapshot,
} from "./schema/project-schema";
import {
  repoExport,
  repoExternalSymbol,
  repoFile,
  repoImportEdge,
  repoParseIssue,
  repoSymbol,
  repoSymbolOccurrence,
  repoSymbolRelationship,
} from "./schema/repo-parse-schema";

// `relations(...)` does not create DB columns.
// It teaches Drizzle how tables connect so relation-aware queries work cleanly.
export const projectRelations = relations(project, ({ one, many }) => ({
  owner: one(user, {
    fields: [project.ownerUserId],
    references: [user.id],
  }),
  imports: many(projectImport),
  mapSnapshots: many(projectMapSnapshot),
}));

export const projectImportRelations = relations(
  projectImport,
  ({ one, many }) => ({
    project: one(project, {
      fields: [projectImport.projectId],
      references: [project.id],
    }),
    triggeredByUser: one(user, {
      fields: [projectImport.triggeredByUserId],
      references: [user.id],
    }),
    mapSnapshot: one(projectMapSnapshot, {
      fields: [projectImport.id],
      references: [projectMapSnapshot.importId],
    }),
    files: many(repoFile),
    symbols: many(repoSymbol),
    symbolOccurrences: many(repoSymbolOccurrence),
    symbolRelationships: many(repoSymbolRelationship),
    importEdges: many(repoImportEdge),
    exports: many(repoExport),
    parseIssues: many(repoParseIssue),
    externalSymbols: many(repoExternalSymbol),
  }),
);

export const projectMapSnapshotRelations = relations(
  projectMapSnapshot,
  ({ one }) => ({
    project: one(project, {
      fields: [projectMapSnapshot.projectId],
      references: [project.id],
    }),
    importRecord: one(projectImport, {
      fields: [projectMapSnapshot.importId],
      references: [projectImport.id],
    }),
  }),
);

export const repoFileRelations = relations(repoFile, ({ one, many }) => ({
  importRecord: one(projectImport, {
    fields: [repoFile.projectImportId],
    references: [projectImport.id],
  }),
  symbols: many(repoSymbol),
  occurrences: many(repoSymbolOccurrence),
  outgoingImportEdges: many(repoImportEdge, {
    relationName: "repo_import_edge_source_file",
  }),
  incomingImportEdges: many(repoImportEdge, {
    relationName: "repo_import_edge_target_file",
  }),
  exports: many(repoExport),
  parseIssues: many(repoParseIssue),
}));

export const repoSymbolRelations = relations(repoSymbol, ({ one, many }) => ({
  importRecord: one(projectImport, {
    fields: [repoSymbol.projectImportId],
    references: [projectImport.id],
  }),
  file: one(repoFile, {
    fields: [repoSymbol.fileId],
    references: [repoFile.id],
  }),
  parentSymbol: one(repoSymbol, {
    fields: [repoSymbol.parentSymbolId],
    references: [repoSymbol.id],
    relationName: "repo_symbol_parent",
  }),
  childSymbols: many(repoSymbol, {
    relationName: "repo_symbol_parent",
  }),
  occurrences: many(repoSymbolOccurrence),
  outgoingRelationships: many(repoSymbolRelationship, {
    relationName: "repo_symbol_relationship_from_symbol",
  }),
  incomingRelationships: many(repoSymbolRelationship, {
    relationName: "repo_symbol_relationship_to_symbol",
  }),
  exports: many(repoExport),
}));

export const repoSymbolOccurrenceRelations = relations(
  repoSymbolOccurrence,
  ({ one }) => ({
    importRecord: one(projectImport, {
      fields: [repoSymbolOccurrence.projectImportId],
      references: [projectImport.id],
    }),
    file: one(repoFile, {
      fields: [repoSymbolOccurrence.fileId],
      references: [repoFile.id],
    }),
    symbol: one(repoSymbol, {
      fields: [repoSymbolOccurrence.symbolId],
      references: [repoSymbol.id],
    }),
  }),
);

export const repoSymbolRelationshipRelations = relations(
  repoSymbolRelationship,
  ({ one }) => ({
    importRecord: one(projectImport, {
      fields: [repoSymbolRelationship.projectImportId],
      references: [projectImport.id],
    }),
    fromSymbol: one(repoSymbol, {
      fields: [repoSymbolRelationship.fromSymbolId],
      references: [repoSymbol.id],
      relationName: "repo_symbol_relationship_from_symbol",
    }),
    toSymbol: one(repoSymbol, {
      fields: [repoSymbolRelationship.toSymbolId],
      references: [repoSymbol.id],
      relationName: "repo_symbol_relationship_to_symbol",
    }),
  }),
);

export const repoImportEdgeRelations = relations(
  repoImportEdge,
  ({ one, many }) => ({
    importRecord: one(projectImport, {
      fields: [repoImportEdge.projectImportId],
      references: [projectImport.id],
    }),
    sourceFile: one(repoFile, {
      fields: [repoImportEdge.sourceFileId],
      references: [repoFile.id],
      relationName: "repo_import_edge_source_file",
    }),
    targetFile: one(repoFile, {
      fields: [repoImportEdge.targetFileId],
      references: [repoFile.id],
      relationName: "repo_import_edge_target_file",
    }),
    exports: many(repoExport),
  }),
);

export const repoExportRelations = relations(repoExport, ({ one }) => ({
  importRecord: one(projectImport, {
    fields: [repoExport.projectImportId],
    references: [projectImport.id],
  }),
  file: one(repoFile, {
    fields: [repoExport.fileId],
    references: [repoFile.id],
  }),
  symbol: one(repoSymbol, {
    fields: [repoExport.symbolId],
    references: [repoSymbol.id],
  }),
  sourceImportEdge: one(repoImportEdge, {
    fields: [repoExport.sourceImportEdgeId],
    references: [repoImportEdge.id],
  }),
}));

export const repoParseIssueRelations = relations(repoParseIssue, ({ one }) => ({
  importRecord: one(projectImport, {
    fields: [repoParseIssue.projectImportId],
    references: [projectImport.id],
  }),
  file: one(repoFile, {
    fields: [repoParseIssue.fileId],
    references: [repoFile.id],
  }),
}));

export const repoExternalSymbolRelations = relations(
  repoExternalSymbol,
  ({ one }) => ({
    importRecord: one(projectImport, {
      fields: [repoExternalSymbol.projectImportId],
      references: [projectImport.id],
    }),
  }),
);
