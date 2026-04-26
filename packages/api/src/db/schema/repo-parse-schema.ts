import { randomUUID } from "node:crypto";
import { relations, sql } from "drizzle-orm";
import {
  AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projectImport } from "./project-schema";

export const repoFileParseStatusEnum = pgEnum("repo_file_parse_status", [
  "parsed",
  "skipped",
  "too_large",
  "binary",
  "unsupported",
  "error",
]);

export const repoSymbolKindEnum = pgEnum("repo_symbol_kind", [
  "module",
  "namespace",
  "class",
  "interface",
  "trait",
  "mixin",
  "enum",
  "enum_member",
  "function",
  "component",
  "method",
  "constructor",
  "property",
  "field",
  "variable",
  "constant",
  "type_alias",
  "parameter",
]);

export const repoSymbolVisibilityEnum = pgEnum("repo_symbol_visibility", [
  "public",
  "protected",
  "private",
  "internal",
  "unknown",
]);

export const repoSymbolOccurrenceRoleEnum = pgEnum(
  "repo_symbol_occurrence_role",
  ["definition", "declaration", "reference", "import", "export", "type_reference"],
);

export const repoSymbolRelationshipKindEnum = pgEnum(
  "repo_symbol_relationship_kind",
  [
    "implements",
    "extends",
    "type_of",
    "calls",
    "references",
    "overrides",
    "exports_from",
    "imports_from",
    "defines",
  ],
);

export const repoImportKindEnum = pgEnum("repo_import_kind", [
  "import",
  "require",
  "dynamic_import",
  "export_from",
  "include",
  "use",
]);

export const repoImportResolutionKindEnum = pgEnum(
  "repo_import_resolution_kind",
  ["relative_path", "tsconfig_alias", "package", "unresolved", "builtin"],
);

export const repoExportKindEnum = pgEnum("repo_export_kind", [
  "named",
  "default",
  "wildcard",
  "re_export",
]);

export const repoParseIssueSeverityEnum = pgEnum("repo_parse_issue_severity", [
  "info",
  "warning",
  "error",
]);

export const repoFile = pgTable(
  "repo_file",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectImportId: text("project_import_id")
      .notNull()
      .references(() => projectImport.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    dirPath: text("dir_path").notNull(),
    baseName: text("base_name").notNull(),
    extension: text("extension"),
    language: text("language"),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    contentSha256: text("content_sha256"),
    isText: boolean("is_text").default(false).notNull(),
    isBinary: boolean("is_binary").default(false).notNull(),
    isGenerated: boolean("is_generated").default(false).notNull(),
    isIgnored: boolean("is_ignored").default(false).notNull(),
    ignoreReason: text("ignore_reason"),
    isParseable: boolean("is_parseable").default(false).notNull(),
    parseStatus: repoFileParseStatusEnum("parse_status").default("parsed").notNull(),
    parserName: text("parser_name"),
    parserVersion: text("parser_version"),
    lineCount: integer("line_count"),
    extraJson: jsonb("extra_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("repo_file_project_import_id_path_unique").on(
      table.projectImportId,
      table.path,
    ),
    index("repo_file_project_import_id_language_idx").on(
      table.projectImportId,
      table.language,
    ),
    index("repo_file_project_import_id_dir_path_idx").on(
      table.projectImportId,
      table.dirPath,
    ),
    index("repo_file_project_import_id_is_parseable_idx")
      .on(table.projectImportId, table.path)
      .where(sql`${table.isParseable} = true`),
  ],
);

export const repoSymbol = pgTable(
  "repo_symbol",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectImportId: text("project_import_id")
      .notNull()
      .references(() => projectImport.id, { onDelete: "cascade" }),
    fileId: text("file_id").references(() => repoFile.id, {
      onDelete: "cascade",
    }),
    stableSymbolKey: text("stable_symbol_key"),
    localSymbolKey: text("local_symbol_key"),
    displayName: text("display_name").notNull(),
    kind: repoSymbolKindEnum("kind").notNull(),
    language: text("language"),
    visibility: repoSymbolVisibilityEnum("visibility")
      .default("unknown")
      .notNull(),
    isExported: boolean("is_exported").default(false).notNull(),
    isDefaultExport: boolean("is_default_export").default(false).notNull(),
    signature: text("signature"),
    returnType: text("return_type"),
    parentSymbolId: text("parent_symbol_id").references(
      (): AnyPgColumn => repoSymbol.id,
      { onDelete: "set null" },
    ),
    ownerSymbolKey: text("owner_symbol_key"),
    docJson: jsonb("doc_json"),
    typeJson: jsonb("type_json"),
    modifiersJson: jsonb("modifiers_json"),
    extraJson: jsonb("extra_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("repo_symbol_pi_symbol_key_unq").on(
      table.projectImportId,
      table.stableSymbolKey,
    ),
    index("repo_symbol_project_import_id_file_id_kind_idx").on(
      table.projectImportId,
      table.fileId,
      table.kind,
    ),
    index("repo_symbol_project_import_id_parent_symbol_id_idx").on(
      table.projectImportId,
      table.parentSymbolId,
    ),
  ],
);

export const repoSymbolOccurrence = pgTable(
  "repo_symbol_occurrence",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectImportId: text("project_import_id")
      .notNull()
      .references(() => projectImport.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => repoFile.id, { onDelete: "cascade" }),
    symbolId: text("symbol_id").references(() => repoSymbol.id, {
      onDelete: "set null",
    }),
    occurrenceRole: repoSymbolOccurrenceRoleEnum("occurrence_role").notNull(),
    startLine: integer("start_line").notNull(),
    startCol: integer("start_col").notNull(),
    endLine: integer("end_line").notNull(),
    endCol: integer("end_col").notNull(),
    syntaxKind: text("syntax_kind"),
    snippetPreview: text("snippet_preview"),
    extraJson: jsonb("extra_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("repo_symbol_occurrence_project_import_id_file_id_role_idx").on(
      table.projectImportId,
      table.fileId,
      table.occurrenceRole,
    ),
    index("repo_symbol_occurrence_project_import_id_symbol_id_role_idx").on(
      table.projectImportId,
      table.symbolId,
      table.occurrenceRole,
    ),
    index("repo_sym_occ_pi_file_range_idx").on(
      table.projectImportId,
      table.fileId,
      table.startLine,
      table.startCol,
      table.endLine,
      table.endCol,
    ),
  ],
);

export const repoSymbolRelationship = pgTable(
  "repo_symbol_relationship",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectImportId: text("project_import_id")
      .notNull()
      .references(() => projectImport.id, { onDelete: "cascade" }),
    fromSymbolId: text("from_symbol_id")
      .notNull()
      .references(() => repoSymbol.id, { onDelete: "cascade" }),
    toSymbolId: text("to_symbol_id").references(() => repoSymbol.id, {
      onDelete: "set null",
    }),
    toExternalSymbolKey: text("to_external_symbol_key"),
    relationshipKind: repoSymbolRelationshipKindEnum("relationship_kind").notNull(),
    isReference: boolean("is_reference").default(false).notNull(),
    isImplementation: boolean("is_implementation").default(false).notNull(),
    isTypeDefinition: boolean("is_type_definition").default(false).notNull(),
    isDefinition: boolean("is_definition").default(false).notNull(),
    extraJson: jsonb("extra_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("repo_symbol_relationship_project_import_id_from_symbol_id_idx").on(
      table.projectImportId,
      table.fromSymbolId,
    ),
    index("repo_symbol_relationship_project_import_id_to_symbol_id_idx").on(
      table.projectImportId,
      table.toSymbolId,
    ),
    index("repo_symbol_relationship_project_import_id_kind_idx").on(
      table.projectImportId,
      table.relationshipKind,
    ),
  ],
);

export const repoImportEdge = pgTable(
  "repo_import_edge",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectImportId: text("project_import_id")
      .notNull()
      .references(() => projectImport.id, { onDelete: "cascade" }),
    sourceFileId: text("source_file_id")
      .notNull()
      .references(() => repoFile.id, { onDelete: "cascade" }),
    targetFileId: text("target_file_id").references(() => repoFile.id, {
      onDelete: "set null",
    }),
    targetPathText: text("target_path_text"),
    targetExternalSymbolKey: text("target_external_symbol_key"),
    moduleSpecifier: text("module_specifier").notNull(),
    importKind: repoImportKindEnum("import_kind").notNull(),
    importedNames: text("imported_names").array().default([]).notNull(),
    isTypeOnly: boolean("is_type_only").default(false).notNull(),
    isResolved: boolean("is_resolved").default(false).notNull(),
    resolutionKind: repoImportResolutionKindEnum("resolution_kind").notNull(),
    startLine: integer("start_line").notNull(),
    startCol: integer("start_col").notNull(),
    endLine: integer("end_line").notNull(),
    endCol: integer("end_col").notNull(),
    extraJson: jsonb("extra_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("repo_import_edge_pi_src_mod_loc_unq").on(
      table.projectImportId,
      table.sourceFileId,
      table.moduleSpecifier,
      table.startLine,
      table.startCol,
    ),
    index("repo_import_edge_project_import_id_source_file_id_idx").on(
      table.projectImportId,
      table.sourceFileId,
    ),
    index("repo_import_edge_project_import_id_target_file_id_idx").on(
      table.projectImportId,
      table.targetFileId,
    ),
  ],
);

export const repoExport = pgTable(
  "repo_export",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectImportId: text("project_import_id")
      .notNull()
      .references(() => projectImport.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => repoFile.id, { onDelete: "cascade" }),
    symbolId: text("symbol_id").references(() => repoSymbol.id, {
      onDelete: "set null",
    }),
    exportName: text("export_name").notNull(),
    exportKind: repoExportKindEnum("export_kind").notNull(),
    sourceImportEdgeId: text("source_import_edge_id").references(
      () => repoImportEdge.id,
      { onDelete: "set null" },
    ),
    targetExternalSymbolKey: text("target_external_symbol_key"),
    startLine: integer("start_line").notNull(),
    startCol: integer("start_col").notNull(),
    endLine: integer("end_line").notNull(),
    endCol: integer("end_col").notNull(),
    extraJson: jsonb("extra_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("repo_export_project_import_id_file_id_idx").on(
      table.projectImportId,
      table.fileId,
    ),
    index("repo_export_project_import_id_symbol_id_idx").on(
      table.projectImportId,
      table.symbolId,
    ),
  ],
);

export const repoParseIssue = pgTable(
  "repo_parse_issue",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectImportId: text("project_import_id")
      .notNull()
      .references(() => projectImport.id, { onDelete: "cascade" }),
    fileId: text("file_id").references(() => repoFile.id, {
      onDelete: "set null",
    }),
    severity: repoParseIssueSeverityEnum("severity").notNull(),
    code: text("code"),
    message: text("message").notNull(),
    detailJson: jsonb("detail_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("repo_parse_issue_project_import_id_severity_idx").on(
      table.projectImportId,
      table.severity,
    ),
    index("repo_parse_issue_project_import_id_file_id_idx").on(
      table.projectImportId,
      table.fileId,
    ),
  ],
);

export const repoExternalSymbol = pgTable(
  "repo_external_symbol",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectImportId: text("project_import_id")
      .notNull()
      .references(() => projectImport.id, { onDelete: "cascade" }),
    symbolKey: text("symbol_key").notNull(),
    packageManager: text("package_manager"),
    packageName: text("package_name"),
    packageVersion: text("package_version"),
    language: text("language"),
    displayName: text("display_name"),
    kind: text("kind"),
    documentationJson: jsonb("documentation_json"),
    extraJson: jsonb("extra_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("repo_external_symbol_project_import_id_symbol_key_unique").on(
      table.projectImportId,
      table.symbolKey,
    ),
    index("repo_external_symbol_project_import_id_package_name_idx").on(
      table.projectImportId,
      table.packageName,
    ),
  ],
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

export const repoImportEdgeRelations = relations(repoImportEdge, ({ one, many }) => ({
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
}));

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

type EnumValue<TEnum extends { enumValues: readonly string[] }> =
  TEnum["enumValues"][number];

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
export type RepoSymbolRecord = typeof repoSymbol.$inferSelect;
export type RepoSymbolInsert = typeof repoSymbol.$inferInsert;
export type RepoSymbolOccurrenceRecord = typeof repoSymbolOccurrence.$inferSelect;
export type RepoSymbolOccurrenceInsert = typeof repoSymbolOccurrence.$inferInsert;
export type RepoSymbolRelationshipRecord =
  typeof repoSymbolRelationship.$inferSelect;
export type RepoSymbolRelationshipInsert =
  typeof repoSymbolRelationship.$inferInsert;
export type RepoImportEdgeRecord = typeof repoImportEdge.$inferSelect;
export type RepoImportEdgeInsert = typeof repoImportEdge.$inferInsert;
export type RepoExportRecord = typeof repoExport.$inferSelect;
export type RepoExportInsert = typeof repoExport.$inferInsert;
export type RepoParseIssueRecord = typeof repoParseIssue.$inferSelect;
export type RepoParseIssueInsert = typeof repoParseIssue.$inferInsert;
export type RepoExternalSymbolRecord = typeof repoExternalSymbol.$inferSelect;
export type RepoExternalSymbolInsert = typeof repoExternalSymbol.$inferInsert;
