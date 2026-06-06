import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createPayPalClientFromEnv } from "../../modules/billing/paypal";
import { createBillingService } from "../../modules/billing/service";
import { createWorkspaceService } from "../../modules/workspace/service";
import type { WorkspacePlan } from "@codemap-ai/shared";

const PAYPAL_PLAN_MAP: Record<string, WorkspacePlan> = {};

const subscribeBodySchema = z.object({
  plan: z.enum(["developer", "team"]),
  workspaceId: z.uuid(),
});

function buildWorkspaceBillingUrl(
  webAppUrl: string,
  workspaceId: string,
  params: Record<string, string>,
) {
  const url = new URL(
    `/w/${workspaceId}/settings/billing`,
    webAppUrl.endsWith("/") ? webAppUrl : `${webAppUrl}/`,
  );

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

const billingRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const paypal = createPayPalClientFromEnv(fastify.config);
  const billingService = createBillingService(fastify.db);
  const workspaceService = createWorkspaceService(fastify.db);

  // Build reverse map: paypal plan id → workspace plan
  if (fastify.config.PAYPAL_PLAN_ID_DEVELOPER) {
    PAYPAL_PLAN_MAP[fastify.config.PAYPAL_PLAN_ID_DEVELOPER] = "developer";
  }
  if (fastify.config.PAYPAL_PLAN_ID_TEAM) {
    PAYPAL_PLAN_MAP[fastify.config.PAYPAL_PLAN_ID_TEAM] = "team";
  }

  // POST /billing/subscribe — tạo PayPal subscription, trả về approval URL
  fastify.post("/subscribe", async (request, reply) => {
    const userId = request.session?.user?.id;
    if (!userId) return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED" } });
    if (!paypal) return reply.code(503).send({ success: false, error: { code: "BILLING_NOT_CONFIGURED" } });

    const { plan, workspaceId } = subscribeBodySchema.parse(request.body ?? {});

    const access = await workspaceService.getWorkspaceAccess(userId, workspaceId);
    if (!access) throw fastify.httpErrors.notFound("Workspace not found");
    if (!["owner", "admin"].includes(access.membership.role)) {
      throw fastify.httpErrors.forbidden("Owner or admin required");
    }

    const planId =
      plan === "developer"
        ? fastify.config.PAYPAL_PLAN_ID_DEVELOPER
        : fastify.config.PAYPAL_PLAN_ID_TEAM;

    if (!planId) {
      return reply.code(503).send({ success: false, error: { code: "PLAN_NOT_CONFIGURED" } });
    }

    const webAppUrl = fastify.config.WEB_APP_URL ?? "http://localhost:3000";
    const returnUrl = buildWorkspaceBillingUrl(webAppUrl, workspaceId, {
      paypal: "success",
    });
    const cancelUrl = buildWorkspaceBillingUrl(webAppUrl, workspaceId, {
      paypal: "cancelled",
    });

    const subscription = await paypal.createSubscription(planId, returnUrl, cancelUrl);

    // Lưu subscription ở trạng thái pending chờ PayPal approve
    await billingService.createSubscription({
      workspaceId,
      plan,
      provider: "paypal",
      providerSubscriptionId: subscription.id,
      providerPlanId: planId,
      status: "trialing",
    });

    const approvalLink = subscription.links.find((l) => l.rel === "approve")?.href;
    return reply.success({ subscriptionId: subscription.id, approvalUrl: approvalLink });
  });

  // POST /billing/cancel — hủy subscription hiện tại
  fastify.post("/cancel", async (request, reply) => {
    const userId = request.session?.user?.id;
    if (!userId) return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED" } });
    if (!paypal) return reply.code(503).send({ success: false, error: { code: "BILLING_NOT_CONFIGURED" } });

    const { workspaceId } = z.object({ workspaceId: z.uuid() }).parse(request.body ?? {});

    const access = await workspaceService.getWorkspaceAccess(userId, workspaceId);
    if (!access) throw fastify.httpErrors.notFound("Workspace not found");
    if (!["owner"].includes(access.membership.role)) {
      throw fastify.httpErrors.forbidden("Owner required");
    }

    const sub = await billingService.getActiveSubscription(workspaceId);
    if (!sub || !sub.providerSubscriptionId) {
      throw fastify.httpErrors.notFound("No active subscription");
    }

    try {
      await paypal.cancelSubscription(sub.providerSubscriptionId, "User requested cancellation");
    } catch (err) {
      // APPROVAL_PENDING subscriptions cannot be cancelled via API — remove from DB directly
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("SUBSCRIPTION_STATUS_INVALID")) {
        await billingService.cancelSubscription({ workspaceId, subscriptionId: sub.id });
        return reply.success({ cancelled: true });
      }
      throw err;
    }

    // PayPal cancel succeeded — mark as cancelling, keep plan until webhook confirms
    await billingService.markCancelling({ subscriptionId: sub.id });

    return reply.success({ cancelled: true });
  });

  // GET /billing/payments — lịch sử thanh toán
  fastify.get("/payments", async (request, reply) => {
    const userId = request.session?.user?.id;
    if (!userId) return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED" } });

    const { workspaceId } = z.object({ workspaceId: z.uuid() }).parse(request.query ?? {});

    const access = await workspaceService.getWorkspaceAccess(userId, workspaceId);
    if (!access) throw fastify.httpErrors.notFound("Workspace not found");

    const payments = await billingService.listPayments(workspaceId);
    return reply.success(payments, 200, { count: payments.length });
  });

  // POST /billing/webhook/paypal — nhận PayPal webhook events
  fastify.post("/webhook/paypal", {
    config: { rawBody: true },
  }, async (request, reply) => {
    if (!paypal) return reply.code(200).send({ received: true });

    const rawBody = (request as unknown as { rawBody: string }).rawBody ?? JSON.stringify(request.body);
    const headers = request.headers as Record<string, string>;

    const isValid = await paypal.verifyWebhookSignature(headers, rawBody);
    if (!isValid) {
      fastify.log.warn("PayPal webhook signature invalid");
      return reply.code(400).send({ error: "Invalid signature" });
    }

    const event = request.body as {
      event_type: string;
      resource: {
        id: string;
        plan_id?: string;
        status?: string;
        billing_info?: {
          next_billing_time?: string;
          last_payment?: { amount: { value: string; currency_code: string }; time: string };
        };
      };
    };

    const subscriptionId = event.resource.id;
    const sub = await billingService.findSubscriptionByProvider("paypal", subscriptionId);
    if (!sub) {
      fastify.log.warn({ subscriptionId }, "PayPal webhook: subscription not found");
      return reply.code(200).send({ received: true });
    }

    const plan = event.resource.plan_id ? PAYPAL_PLAN_MAP[event.resource.plan_id] ?? sub.plan : sub.plan;
    const billingInfo = event.resource.billing_info;

    switch (event.event_type) {
      case "BILLING.SUBSCRIPTION.ACTIVATED":
      case "BILLING.SUBSCRIPTION.RENEWED": {
        const periodEnd = billingInfo?.next_billing_time
          ? new Date(billingInfo.next_billing_time)
          : undefined;

        await billingService.activateSubscription({
          workspaceId: sub.workspaceId,
          subscriptionId: sub.id,
          plan,
          currentPeriodEnd: periodEnd,
        });

        const lastPayment = billingInfo?.last_payment;
        if (lastPayment) {
          await billingService.recordPayment({
            workspaceId: sub.workspaceId,
            subscriptionId: sub.id,
            provider: "paypal",
            providerOrderId: subscriptionId,
            amount: lastPayment.amount.value,
            currency: lastPayment.amount.currency_code,
            status: "completed",
            plan,
            metadataJson: { eventType: event.event_type },
          });
        }
        break;
      }

      case "BILLING.SUBSCRIPTION.CANCELLED": {
        // Mark cancelled but keep plan — cron job downgrades when currentPeriodEnd passes
        await billingService.markCancelled({ subscriptionId: sub.id });
        break;
      }

      case "BILLING.SUBSCRIPTION.EXPIRED": {
        // Period actually ended — downgrade immediately
        await billingService.cancelSubscription({
          workspaceId: sub.workspaceId,
          subscriptionId: sub.id,
        });
        break;
      }

      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED": {
        await billingService.updateSubscription(sub.id, { status: "past_due" });
        await billingService.recordPayment({
          workspaceId: sub.workspaceId,
          subscriptionId: sub.id,
          provider: "paypal",
          providerOrderId: subscriptionId,
          status: "failed",
          plan,
          metadataJson: { eventType: event.event_type },
        });
        break;
      }

      default:
        fastify.log.debug({ eventType: event.event_type }, "PayPal webhook: unhandled event");
    }

    return reply.code(200).send({ received: true });
  });
};

export default billingRoutes;
