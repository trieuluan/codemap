import { randomUUID } from "node:crypto";
import { customType } from "drizzle-orm/pg-core";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { project, projectImport } from "./project-schema";
import { repoFile, repoSymbol } from "./repo-parse-schema";

// Dynamic-dimension vector — no fixed size so any embedding model can be used
// without schema migrations. Trade-off: HNSW index requires fixed dims, so
// similarity queries use sequential scan unless a per-dimension index exists.
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector";
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string) {
    return value
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .filter(Boolean)
      .map(Number);
  },
});

export const codeEmbeddingChunkTypeEnum = pgEnum("code_embedding_chunk_type", [
  "file",
  "symbol",
  "doc",
  "test",
  "route",
  "config",
]);

export const embeddingIndexRunStatusEnum = pgEnum("embedding_index_run_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const codeEmbedding = pgTable(
  "code_embeddings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    fileId: text("file_id").references(() => repoFile.id, { onDelete: "set null" }),
    path: text("path").notNull(),
    symbolId: text("symbol_id").references(() => repoSymbol.id, {
      onDelete: "set null",
    }),
    chunkKey: text("chunk_key").notNull(),
    chunkType: codeEmbeddingChunkTypeEnum("chunk_type").notNull(),
    language: text("language"),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    embedding: vector("embedding").notNull(),
    model: text("model").notNull(),
    dimensions: integer("dimensions").default(1536).notNull(),
    startLine: integer("start_line"),
    endLine: integer("end_line"),
    metadata: jsonb("metadata"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("code_embeddings_project_idx").on(table.projectId),
    index("code_embeddings_project_model_idx").on(
      table.projectId,
      table.model,
      table.dimensions,
    ),
    uniqueIndex("code_embeddings_unique_chunk_idx").on(
      table.projectId,
      table.path,
      table.chunkType,
      table.startLine,
      table.endLine,
      table.contentHash,
    ),
    uniqueIndex("code_embeddings_chunk_key_idx").on(
      table.projectId,
      table.chunkKey,
    ),
  ],
);

export const embeddingIndexRun = pgTable(
  "embedding_index_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    projectImportId: text("project_import_id").references(() => projectImport.id, {
      onDelete: "set null",
    }),
    status: embeddingIndexRunStatusEnum("status").default("queued").notNull(),
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),
    chunksTotal: integer("chunks_total").default(0).notNull(),
    chunksEmbedded: integer("chunks_embedded").default(0).notNull(),
    chunksSkipped: integer("chunks_skipped").default(0).notNull(),
    tokensEstimated: integer("tokens_estimated").default(0).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("embedding_index_runs_project_idx").on(table.projectId),
    index("embedding_index_runs_status_idx").on(table.status),
  ],
);
