ALTER TYPE "public"."project_provider" ADD VALUE 'local_workspace';--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "local_workspace_path" text;--> statement-breakpoint
CREATE INDEX "project_provider_local_workspace_path_idx" ON "project" USING btree ("provider","local_workspace_path");