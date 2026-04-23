CREATE TABLE "user_github_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"github_user_id" integer NOT NULL,
	"github_login" text NOT NULL,
	"access_token" text NOT NULL,
	"token_type" text DEFAULT 'bearer' NOT NULL,
	"scope" text NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_github_connection_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_github_connection" ADD CONSTRAINT "user_github_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_github_connection_userId_idx" ON "user_github_connection" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_github_connection_githubUserId_idx" ON "user_github_connection" USING btree ("github_user_id");