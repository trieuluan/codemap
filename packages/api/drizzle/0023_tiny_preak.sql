CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."code_embedding_chunk_type" AS ENUM('file', 'symbol', 'doc', 'test', 'route', 'config');--> statement-breakpoint
CREATE TYPE "public"."embedding_index_run_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "code_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"file_id" text,
	"path" text NOT NULL,
	"symbol_id" text,
	"chunk_key" text NOT NULL,
	"chunk_type" "code_embedding_chunk_type" NOT NULL,
	"language" text,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer DEFAULT 1536 NOT NULL,
	"start_line" integer,
	"end_line" integer,
	"metadata" jsonb,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embedding_index_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"project_import_id" text,
	"status" "embedding_index_run_status" DEFAULT 'queued' NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"chunks_total" integer DEFAULT 0 NOT NULL,
	"chunks_embedded" integer DEFAULT 0 NOT NULL,
	"chunks_skipped" integer DEFAULT 0 NOT NULL,
	"tokens_estimated" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_embeddings" ADD CONSTRAINT "code_embeddings_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_embeddings" ADD CONSTRAINT "code_embeddings_file_id_repo_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."repo_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_embeddings" ADD CONSTRAINT "code_embeddings_symbol_id_repo_symbol_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."repo_symbol"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_index_runs" ADD CONSTRAINT "embedding_index_runs_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_index_runs" ADD CONSTRAINT "embedding_index_runs_project_import_id_project_import_id_fk" FOREIGN KEY ("project_import_id") REFERENCES "public"."project_import"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_embeddings_project_idx" ON "code_embeddings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "code_embeddings_project_model_idx" ON "code_embeddings" USING btree ("project_id","model","dimensions");--> statement-breakpoint
CREATE INDEX "code_embeddings_embedding_hnsw_idx" ON "code_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "code_embeddings_unique_chunk_idx" ON "code_embeddings" USING btree ("project_id","path","chunk_type","start_line","end_line","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "code_embeddings_chunk_key_idx" ON "code_embeddings" USING btree ("project_id","chunk_key");--> statement-breakpoint
CREATE INDEX "embedding_index_runs_project_idx" ON "embedding_index_runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "embedding_index_runs_status_idx" ON "embedding_index_runs" USING btree ("status");