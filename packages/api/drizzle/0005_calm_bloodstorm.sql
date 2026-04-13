ALTER TABLE "project_import" ADD COLUMN "commit_sha" text;
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "source_storage_key" text;
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "source_workspace_path" text;
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "source_available" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX "project_import_project_id_source_available_idx" ON "project_import" USING btree ("project_id","source_available");
