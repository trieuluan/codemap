CREATE TYPE "public"."billing_provider" AS ENUM('paypal', 'stripe', 'manual');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('completed', 'failed', 'refunded', 'pending');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'cancelled', 'past_due', 'paused', 'trialing');--> statement-breakpoint
CREATE TABLE "workspace_payment" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"subscription_id" text,
	"provider" "billing_provider" NOT NULL,
	"provider_order_id" text,
	"provider_capture_id" text,
	"amount" numeric(10, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "payment_status" NOT NULL,
	"plan" "workspace_plan" NOT NULL,
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"plan" "workspace_plan" NOT NULL,
	"provider" "billing_provider" NOT NULL,
	"provider_subscription_id" text,
	"provider_plan_id" text,
	"status" "subscription_status" NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_payment" ADD CONSTRAINT "workspace_payment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_payment" ADD CONSTRAINT "workspace_payment_subscription_id_workspace_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."workspace_subscription"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_subscription" ADD CONSTRAINT "workspace_subscription_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_payment_workspace_id_idx" ON "workspace_payment" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_payment_subscription_id_idx" ON "workspace_payment" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "workspace_payment_provider_order_id_idx" ON "workspace_payment" USING btree ("provider","provider_order_id");--> statement-breakpoint
CREATE INDEX "workspace_subscription_workspace_id_idx" ON "workspace_subscription" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_subscription_provider_subscription_id_idx" ON "workspace_subscription" USING btree ("provider","provider_subscription_id");