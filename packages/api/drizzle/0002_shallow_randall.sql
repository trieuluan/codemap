CREATE TYPE "public"."project_import_status" AS ENUM('queued', 'importing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."project_provider" AS ENUM('github');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'importing', 'ready', 'failed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."project_visibility" AS ENUM('private', 'public', 'internal');--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"owner_user_id" text NOT NULL,
	"visibility" "project_visibility" DEFAULT 'private' NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"default_branch" text,
	"repository_url" text,
	"provider" "project_provider",
	"external_repo_id" text,
	"last_imported_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_import" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"triggered_by_user_id" text NOT NULL,
	"status" "project_import_status" DEFAULT 'queued' NOT NULL,
	"branch" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_import" ADD CONSTRAINT "project_import_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_import" ADD CONSTRAINT "project_import_triggered_by_user_id_user_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_slug_unique" ON "project" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "project_owner_user_id_idx" ON "project" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "project_status_idx" ON "project" USING btree ("status");--> statement-breakpoint
CREATE INDEX "project_provider_external_repo_id_idx" ON "project" USING btree ("provider","external_repo_id");--> statement-breakpoint
CREATE INDEX "project_import_project_id_idx" ON "project_import" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_import_triggered_by_user_id_idx" ON "project_import" USING btree ("triggered_by_user_id");--> statement-breakpoint
CREATE INDEX "project_import_status_idx" ON "project_import" USING btree ("status");