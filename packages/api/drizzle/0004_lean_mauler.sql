CREATE TABLE "project_map_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"import_id" text NOT NULL,
	"tree_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_map_snapshot" ADD CONSTRAINT "project_map_snapshot_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_map_snapshot" ADD CONSTRAINT "project_map_snapshot_import_id_project_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."project_import"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_map_snapshot_import_id_unique" ON "project_map_snapshot" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "project_map_snapshot_project_id_idx" ON "project_map_snapshot" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_map_snapshot_project_id_created_at_idx" ON "project_map_snapshot" USING btree ("project_id","created_at");