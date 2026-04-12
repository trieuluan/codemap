ALTER TABLE "project_import" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "project_import" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
UPDATE "project_import"
SET "status" = CASE
  WHEN "status" = 'queued' THEN 'pending'
  WHEN "status" = 'importing' THEN 'running'
  ELSE "status"
END;--> statement-breakpoint
DROP TYPE "public"."project_import_status";--> statement-breakpoint
CREATE TYPE "public"."project_import_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "project_import" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."project_import_status";--> statement-breakpoint
ALTER TABLE "project_import" ALTER COLUMN "status" SET DATA TYPE "public"."project_import_status" USING "status"::"public"."project_import_status";
