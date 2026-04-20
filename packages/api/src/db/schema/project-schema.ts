import { randomUUID } from "node:crypto";
import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import {
  repoExternalSymbol,
  repoExport,
  repoFile,
  repoImportEdge,
  repoParseIssue,
  repoSymbol,
  repoSymbolOccurrence,
  repoSymbolRelationship,
} from "./repo-parse-schema";

// PostgreSQL enum types for domain-specific constrained values.
export const projectVisibilityEnum = pgEnum("project_visibility", [
  "private",
  "public",
  "internal",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  "importing",
  "ready",
  "failed",
  "archived",
]);

export const projectProviderEnum = pgEnum("project_provider", ["github"]);

export const projectImportStatusEnum = pgEnum("project_import_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const repoParseStatusEnum = pgEnum("repo_parse_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "partial",
]);

// The main project table. `pgTable` defines the Postgres table shape,
// while each column helper (`text`, `timestamp`, enum(...)`) defines a column type.
export const project = pgTable(
  "project",
  {
    // Application-generated string UUID primary key.
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    // Foreign key to Better Auth's user table. Cascade keeps owned projects tidy on user deletion.
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Enum columns become native Postgres enums via `pgEnum`.
    visibility: projectVisibilityEnum("visibility").default("private").notNull(),
    status: projectStatusEnum("status").default("draft").notNull(),
    defaultBranch: text("default_branch"),
    repositoryUrl: text("repository_url"),
    provider: projectProviderEnum("provider"),
    externalRepoId: text("external_repo_id"),
    lastImportedAt: timestamp("last_imported_at"),
    // `defaultNow()` sets a DB-side default timestamp on insert.
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // `$onUpdate()` refreshes the value whenever Drizzle updates the row.
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // `uniqueIndex` both accelerates lookups and enforces uniqueness.
    uniqueIndex("project_slug_unique").on(table.slug),
    // Standard indexes for common filters and future sync lookups.
    index("project_owner_user_id_idx").on(table.ownerUserId),
    index("project_status_idx").on(table.status),
    index("project_provider_external_repo_id_idx").on(
      table.provider,
      table.externalRepoId,
    ),
  ],
);

// Import history table. Each row represents one import attempt / job lifecycle.
export const projectImport = pgTable(
  "project_import",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    // Link imports back to the owning project.
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    // Track who triggered the import for auditing and future UX.
    triggeredByUserId: text("triggered_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: projectImportStatusEnum("status").default("pending").notNull(),
    branch: text("branch"),
    commitSha: text("commit_sha"),
    sourceStorageKey: text("source_storage_key"),
    sourceWorkspacePath: text("source_workspace_path"),
    sourceAvailable: boolean("source_available").default(false).notNull(),
    parseStatus: repoParseStatusEnum("parse_status").default("pending").notNull(),
    parseTool: text("parse_tool"),
    parseToolVersion: text("parse_tool_version"),
    parseStartedAt: timestamp("parse_started_at"),
    parseCompletedAt: timestamp("parse_completed_at"),
    parseError: text("parse_error"),
    indexedFileCount: integer("indexed_file_count").default(0).notNull(),
    indexedSymbolCount: integer("indexed_symbol_count").default(0).notNull(),
    indexedEdgeCount: integer("indexed_edge_count").default(0).notNull(),
    parseStatsJson: jsonb("parse_stats_json"),
    ignoreRulesJson: jsonb("ignore_rules_json"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("project_import_project_id_idx").on(table.projectId),
    index("project_import_triggered_by_user_id_idx").on(table.triggeredByUserId),
    index("project_import_status_idx").on(table.status),
    index("project_import_parse_status_idx").on(table.parseStatus),
    index("project_import_project_id_source_available_idx").on(
      table.projectId,
      table.sourceAvailable,
    ),
  ],
);

export const projectMapSnapshot = pgTable(
  "project_map_snapshot",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    importId: text("import_id")
      .notNull()
      .references(() => projectImport.id, { onDelete: "cascade" }),
    treeJson: jsonb("tree_json").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("project_map_snapshot_import_id_unique").on(table.importId),
    index("project_map_snapshot_project_id_idx").on(table.projectId),
    index("project_map_snapshot_project_id_created_at_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

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

export const projectImportRelations = relations(projectImport, ({ one, many }) => ({
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
}));

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
