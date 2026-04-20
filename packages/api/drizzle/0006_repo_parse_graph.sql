CREATE TYPE "public"."repo_parse_status" AS ENUM('pending', 'running', 'completed', 'failed', 'partial');
--> statement-breakpoint
CREATE TYPE "public"."repo_file_parse_status" AS ENUM('parsed', 'skipped', 'too_large', 'binary', 'unsupported', 'error');
--> statement-breakpoint
CREATE TYPE "public"."repo_symbol_kind" AS ENUM('module', 'namespace', 'class', 'interface', 'trait', 'mixin', 'enum', 'enum_member', 'function', 'method', 'constructor', 'property', 'field', 'variable', 'constant', 'type_alias', 'parameter');
--> statement-breakpoint
CREATE TYPE "public"."repo_symbol_visibility" AS ENUM('public', 'protected', 'private', 'internal', 'unknown');
--> statement-breakpoint
CREATE TYPE "public"."repo_symbol_occurrence_role" AS ENUM('definition', 'declaration', 'reference', 'import', 'export', 'type_reference');
--> statement-breakpoint
CREATE TYPE "public"."repo_symbol_relationship_kind" AS ENUM('implements', 'extends', 'type_of', 'calls', 'references', 'overrides', 'exports_from', 'imports_from', 'defines');
--> statement-breakpoint
CREATE TYPE "public"."repo_import_kind" AS ENUM('import', 'require', 'dynamic_import', 'export_from', 'include', 'use');
--> statement-breakpoint
CREATE TYPE "public"."repo_import_resolution_kind" AS ENUM('relative_path', 'tsconfig_alias', 'package', 'unresolved', 'builtin');
--> statement-breakpoint
CREATE TYPE "public"."repo_export_kind" AS ENUM('named', 'default', 'wildcard', 're_export');
--> statement-breakpoint
CREATE TYPE "public"."repo_parse_issue_severity" AS ENUM('info', 'warning', 'error');
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "parse_status" "repo_parse_status" DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "parse_tool" text;
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "parse_tool_version" text;
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "parse_started_at" timestamp;
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "parse_completed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "parse_error" text;
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "indexed_file_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "indexed_symbol_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "indexed_edge_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "parse_stats_json" jsonb;
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "ignore_rules_json" jsonb;
--> statement-breakpoint
CREATE TABLE "repo_file" (
	"id" text PRIMARY KEY NOT NULL,
	"project_import_id" text NOT NULL,
	"path" text NOT NULL,
	"dir_path" text NOT NULL,
	"base_name" text NOT NULL,
	"extension" text,
	"language" text,
	"mime_type" text,
	"size_bytes" bigint,
	"content_sha256" text,
	"is_text" boolean DEFAULT false NOT NULL,
	"is_binary" boolean DEFAULT false NOT NULL,
	"is_generated" boolean DEFAULT false NOT NULL,
	"is_ignored" boolean DEFAULT false NOT NULL,
	"ignore_reason" text,
	"is_parseable" boolean DEFAULT false NOT NULL,
	"parse_status" "repo_file_parse_status" DEFAULT 'parsed' NOT NULL,
	"parser_name" text,
	"parser_version" text,
	"line_count" integer,
	"extra_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_symbol" (
	"id" text PRIMARY KEY NOT NULL,
	"project_import_id" text NOT NULL,
	"file_id" text,
	"stable_symbol_key" text,
	"local_symbol_key" text,
	"display_name" text NOT NULL,
	"kind" "repo_symbol_kind" NOT NULL,
	"language" text,
	"visibility" "repo_symbol_visibility" DEFAULT 'unknown' NOT NULL,
	"is_exported" boolean DEFAULT false NOT NULL,
	"is_default_export" boolean DEFAULT false NOT NULL,
	"signature" text,
	"return_type" text,
	"parent_symbol_id" text,
	"owner_symbol_key" text,
	"doc_json" jsonb,
	"type_json" jsonb,
	"modifiers_json" jsonb,
	"extra_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_symbol_occurrence" (
	"id" text PRIMARY KEY NOT NULL,
	"project_import_id" text NOT NULL,
	"file_id" text NOT NULL,
	"symbol_id" text,
	"occurrence_role" "repo_symbol_occurrence_role" NOT NULL,
	"start_line" integer NOT NULL,
	"start_col" integer NOT NULL,
	"end_line" integer NOT NULL,
	"end_col" integer NOT NULL,
	"syntax_kind" text,
	"snippet_preview" text,
	"extra_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_symbol_relationship" (
	"id" text PRIMARY KEY NOT NULL,
	"project_import_id" text NOT NULL,
	"from_symbol_id" text NOT NULL,
	"to_symbol_id" text,
	"to_external_symbol_key" text,
	"relationship_kind" "repo_symbol_relationship_kind" NOT NULL,
	"is_reference" boolean DEFAULT false NOT NULL,
	"is_implementation" boolean DEFAULT false NOT NULL,
	"is_type_definition" boolean DEFAULT false NOT NULL,
	"is_definition" boolean DEFAULT false NOT NULL,
	"extra_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_import_edge" (
	"id" text PRIMARY KEY NOT NULL,
	"project_import_id" text NOT NULL,
	"source_file_id" text NOT NULL,
	"target_file_id" text,
	"target_path_text" text,
	"target_external_symbol_key" text,
	"module_specifier" text NOT NULL,
	"import_kind" "repo_import_kind" NOT NULL,
	"is_type_only" boolean DEFAULT false NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolution_kind" "repo_import_resolution_kind" NOT NULL,
	"start_line" integer NOT NULL,
	"start_col" integer NOT NULL,
	"end_line" integer NOT NULL,
	"end_col" integer NOT NULL,
	"extra_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_export" (
	"id" text PRIMARY KEY NOT NULL,
	"project_import_id" text NOT NULL,
	"file_id" text NOT NULL,
	"symbol_id" text,
	"export_name" text NOT NULL,
	"export_kind" "repo_export_kind" NOT NULL,
	"source_import_edge_id" text,
	"target_external_symbol_key" text,
	"start_line" integer NOT NULL,
	"start_col" integer NOT NULL,
	"end_line" integer NOT NULL,
	"end_col" integer NOT NULL,
	"extra_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_parse_issue" (
	"id" text PRIMARY KEY NOT NULL,
	"project_import_id" text NOT NULL,
	"file_id" text,
	"severity" "repo_parse_issue_severity" NOT NULL,
	"code" text,
	"message" text NOT NULL,
	"detail_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_external_symbol" (
	"id" text PRIMARY KEY NOT NULL,
	"project_import_id" text NOT NULL,
	"symbol_key" text NOT NULL,
	"package_manager" text,
	"package_name" text,
	"package_version" text,
	"language" text,
	"display_name" text,
	"kind" text,
	"documentation_json" jsonb,
	"extra_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo_file" ADD CONSTRAINT "repo_file_project_import_id_project_import_id_fk" FOREIGN KEY ("project_import_id") REFERENCES "public"."project_import"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_symbol" ADD CONSTRAINT "repo_symbol_project_import_id_project_import_id_fk" FOREIGN KEY ("project_import_id") REFERENCES "public"."project_import"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_symbol" ADD CONSTRAINT "repo_symbol_file_id_repo_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."repo_file"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_symbol" ADD CONSTRAINT "repo_symbol_parent_symbol_id_repo_symbol_id_fk" FOREIGN KEY ("parent_symbol_id") REFERENCES "public"."repo_symbol"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_symbol_occurrence" ADD CONSTRAINT "repo_symbol_occurrence_project_import_id_project_import_id_fk" FOREIGN KEY ("project_import_id") REFERENCES "public"."project_import"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_symbol_occurrence" ADD CONSTRAINT "repo_symbol_occurrence_file_id_repo_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."repo_file"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_symbol_occurrence" ADD CONSTRAINT "repo_symbol_occurrence_symbol_id_repo_symbol_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."repo_symbol"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_symbol_relationship" ADD CONSTRAINT "repo_symbol_relationship_project_import_id_project_import_id_fk" FOREIGN KEY ("project_import_id") REFERENCES "public"."project_import"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_symbol_relationship" ADD CONSTRAINT "repo_symbol_relationship_from_symbol_id_repo_symbol_id_fk" FOREIGN KEY ("from_symbol_id") REFERENCES "public"."repo_symbol"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_symbol_relationship" ADD CONSTRAINT "repo_symbol_relationship_to_symbol_id_repo_symbol_id_fk" FOREIGN KEY ("to_symbol_id") REFERENCES "public"."repo_symbol"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_import_edge" ADD CONSTRAINT "repo_import_edge_project_import_id_project_import_id_fk" FOREIGN KEY ("project_import_id") REFERENCES "public"."project_import"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_import_edge" ADD CONSTRAINT "repo_import_edge_source_file_id_repo_file_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."repo_file"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_import_edge" ADD CONSTRAINT "repo_import_edge_target_file_id_repo_file_id_fk" FOREIGN KEY ("target_file_id") REFERENCES "public"."repo_file"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_export" ADD CONSTRAINT "repo_export_project_import_id_project_import_id_fk" FOREIGN KEY ("project_import_id") REFERENCES "public"."project_import"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_export" ADD CONSTRAINT "repo_export_file_id_repo_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."repo_file"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_export" ADD CONSTRAINT "repo_export_symbol_id_repo_symbol_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."repo_symbol"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_export" ADD CONSTRAINT "repo_export_source_import_edge_id_repo_import_edge_id_fk" FOREIGN KEY ("source_import_edge_id") REFERENCES "public"."repo_import_edge"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_parse_issue" ADD CONSTRAINT "repo_parse_issue_project_import_id_project_import_id_fk" FOREIGN KEY ("project_import_id") REFERENCES "public"."project_import"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_parse_issue" ADD CONSTRAINT "repo_parse_issue_file_id_repo_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."repo_file"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_external_symbol" ADD CONSTRAINT "repo_external_symbol_project_import_id_project_import_id_fk" FOREIGN KEY ("project_import_id") REFERENCES "public"."project_import"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "project_import_parse_status_idx" ON "project_import" USING btree ("parse_status");
--> statement-breakpoint
CREATE UNIQUE INDEX "repo_file_project_import_id_path_unique" ON "repo_file" USING btree ("project_import_id","path");
--> statement-breakpoint
CREATE INDEX "repo_file_project_import_id_language_idx" ON "repo_file" USING btree ("project_import_id","language");
--> statement-breakpoint
CREATE INDEX "repo_file_project_import_id_dir_path_idx" ON "repo_file" USING btree ("project_import_id","dir_path");
--> statement-breakpoint
CREATE INDEX "repo_file_project_import_id_is_parseable_idx" ON "repo_file" USING btree ("project_import_id","path") WHERE "is_parseable" = true;
--> statement-breakpoint
CREATE UNIQUE INDEX "repo_symbol_pi_symbol_key_unq" ON "repo_symbol" USING btree ("project_import_id","stable_symbol_key");
--> statement-breakpoint
CREATE INDEX "repo_symbol_project_import_id_file_id_kind_idx" ON "repo_symbol" USING btree ("project_import_id","file_id","kind");
--> statement-breakpoint
CREATE INDEX "repo_symbol_project_import_id_parent_symbol_id_idx" ON "repo_symbol" USING btree ("project_import_id","parent_symbol_id");
--> statement-breakpoint
CREATE INDEX "repo_symbol_occurrence_project_import_id_file_id_role_idx" ON "repo_symbol_occurrence" USING btree ("project_import_id","file_id","occurrence_role");
--> statement-breakpoint
CREATE INDEX "repo_symbol_occurrence_project_import_id_symbol_id_role_idx" ON "repo_symbol_occurrence" USING btree ("project_import_id","symbol_id","occurrence_role");
--> statement-breakpoint
CREATE INDEX "repo_sym_occ_pi_file_range_idx" ON "repo_symbol_occurrence" USING btree ("project_import_id","file_id","start_line","start_col","end_line","end_col");
--> statement-breakpoint
CREATE INDEX "repo_symbol_relationship_project_import_id_from_symbol_id_idx" ON "repo_symbol_relationship" USING btree ("project_import_id","from_symbol_id");
--> statement-breakpoint
CREATE INDEX "repo_symbol_relationship_project_import_id_to_symbol_id_idx" ON "repo_symbol_relationship" USING btree ("project_import_id","to_symbol_id");
--> statement-breakpoint
CREATE INDEX "repo_symbol_relationship_project_import_id_kind_idx" ON "repo_symbol_relationship" USING btree ("project_import_id","relationship_kind");
--> statement-breakpoint
CREATE UNIQUE INDEX "repo_import_edge_pi_src_mod_loc_unq" ON "repo_import_edge" USING btree ("project_import_id","source_file_id","module_specifier","start_line","start_col");
--> statement-breakpoint
CREATE INDEX "repo_import_edge_project_import_id_source_file_id_idx" ON "repo_import_edge" USING btree ("project_import_id","source_file_id");
--> statement-breakpoint
CREATE INDEX "repo_import_edge_project_import_id_target_file_id_idx" ON "repo_import_edge" USING btree ("project_import_id","target_file_id");
--> statement-breakpoint
CREATE INDEX "repo_export_project_import_id_file_id_idx" ON "repo_export" USING btree ("project_import_id","file_id");
--> statement-breakpoint
CREATE INDEX "repo_export_project_import_id_symbol_id_idx" ON "repo_export" USING btree ("project_import_id","symbol_id");
--> statement-breakpoint
CREATE INDEX "repo_parse_issue_project_import_id_severity_idx" ON "repo_parse_issue" USING btree ("project_import_id","severity");
--> statement-breakpoint
CREATE INDEX "repo_parse_issue_project_import_id_file_id_idx" ON "repo_parse_issue" USING btree ("project_import_id","file_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "repo_external_symbol_project_import_id_symbol_key_unique" ON "repo_external_symbol" USING btree ("project_import_id","symbol_key");
--> statement-breakpoint
CREATE INDEX "repo_external_symbol_project_import_id_package_name_idx" ON "repo_external_symbol" USING btree ("project_import_id","package_name");
