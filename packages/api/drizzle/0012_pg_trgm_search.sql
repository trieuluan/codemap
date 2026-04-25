CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repo_file_path_trgm_idx" ON "repo_file" USING GIN ("path" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repo_symbol_display_name_trgm_idx" ON "repo_symbol" USING GIN ("display_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repo_export_export_name_trgm_idx" ON "repo_export" USING GIN ("export_name" gin_trgm_ops);
