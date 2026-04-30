import { and, eq } from "drizzle-orm";
import type { db as dbType } from "../../db";
import {
  workspace,
  workspaceSubscription,
  workspacePayment,
} from "../../db/schema";
import type { WorkspacePlan } from "@codemap/shared";

type Database = typeof dbType;

export function createBillingService(database: Database) {
  return {
    async getActiveSubscription(workspaceId: string) {
      return database.query.workspaceSubscription.findFirst({
        where: and(
          eq(workspaceSubscription.workspaceId, workspaceId),
          eq(workspaceSubscription.status, "active"),
        ),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
    },

    async findSubscriptionByProvider(provider: string, providerSubscriptionId: string) {
      return database.query.workspaceSubscription.findFirst({
        where: and(
          eq(workspaceSubscription.provider, provider as "paypal" | "stripe" | "manual"),
          eq(workspaceSubscription.providerSubscriptionId, providerSubscriptionId),
        ),
      });
    },

    async createSubscription(input: {
      workspaceId: string;
      plan: WorkspacePlan;
      provider: "paypal" | "stripe" | "manual";
      providerSubscriptionId?: string;
      providerPlanId?: string;
      status: "active" | "trialing" | "paused" | "cancelled" | "past_due";
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
    }) {
      const [created] = await database
        .insert(workspaceSubscription)
        .values({
          workspaceId: input.workspaceId,
          plan: input.plan,
          provider: input.provider,
          providerSubscriptionId: input.providerSubscriptionId ?? null,
          providerPlanId: input.providerPlanId ?? null,
          status: input.status,
          currentPeriodStart: input.currentPeriodStart ?? null,
          currentPeriodEnd: input.currentPeriodEnd ?? null,
        })
        .returning();
      return created;
    },

    async updateSubscription(
      subscriptionId: string,
      input: {
        status?: "active" | "trialing" | "paused" | "cancelled" | "past_due";
        currentPeriodStart?: Date;
        currentPeriodEnd?: Date;
        cancelledAt?: Date;
      },
    ) {
      const [updated] = await database
        .update(workspaceSubscription)
        .set(input)
        .where(eq(workspaceSubscription.id, subscriptionId))
        .returning();
      return updated ?? null;
    },

    async activateSubscription(input: {
      workspaceId: string;
      subscriptionId: string;
      plan: WorkspacePlan;
      currentPeriodEnd?: Date;
    }) {
      return database.transaction(async (tx) => {
        await tx
          .update(workspaceSubscription)
          .set({
            status: "active",
            currentPeriodEnd: input.currentPeriodEnd ?? null,
            updatedAt: new Date(),
          })
          .where(eq(workspaceSubscription.id, input.subscriptionId));

        await tx
          .update(workspace)
          .set({ plan: input.plan, updatedAt: new Date() })
          .where(eq(workspace.id, input.workspaceId));
      });
    },

    async cancelSubscription(input: {
      workspaceId: string;
      subscriptionId: string;
    }) {
      return database.transaction(async (tx) => {
        await tx
          .update(workspaceSubscription)
          .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(workspaceSubscription.id, input.subscriptionId));

        await tx
          .update(workspace)
          .set({ plan: "beta", updatedAt: new Date() })
          .where(eq(workspace.id, input.workspaceId));
      });
    },

    async recordPayment(input: {
      workspaceId: string;
      subscriptionId?: string;
      provider: "paypal" | "stripe" | "manual";
      providerOrderId?: string;
      providerCaptureId?: string;
      amount?: string;
      currency?: string;
      status: "completed" | "failed" | "refunded" | "pending";
      plan: WorkspacePlan;
      metadataJson?: Record<string, unknown>;
    }) {
      const [created] = await database
        .insert(workspacePayment)
        .values({
          workspaceId: input.workspaceId,
          subscriptionId: input.subscriptionId ?? null,
          provider: input.provider,
          providerOrderId: input.providerOrderId ?? null,
          providerCaptureId: input.providerCaptureId ?? null,
          amount: input.amount ?? null,
          currency: input.currency ?? "USD",
          status: input.status,
          plan: input.plan,
          metadataJson: input.metadataJson ?? null,
        })
        .returning();
      return created;
    },

    async listPayments(workspaceId: string) {
      return database.query.workspacePayment.findMany({
        where: eq(workspacePayment.workspaceId, workspaceId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: 50,
      });
    },
  };
}
