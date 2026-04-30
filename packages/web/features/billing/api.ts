import { requestApi } from "@/lib/api/client";

export type WorkspacePayment = {
  id: string;
  workspaceId: string;
  subscriptionId: string | null;
  provider: "paypal" | "stripe" | "manual";
  providerOrderId: string | null;
  providerCaptureId: string | null;
  amount: string | null;
  currency: string;
  status: "completed" | "failed" | "refunded" | "pending";
  plan: string;
  createdAt: string;
};

export async function createSubscription(input: {
  plan: "developer" | "team";
  workspaceId: string;
}): Promise<{ subscriptionId: string; approvalUrl: string }> {
  return requestApi("/billing/subscribe", {
    method: "POST",
    body: input,
  });
}

export async function cancelSubscription(workspaceId: string): Promise<void> {
  await requestApi("/billing/cancel", {
    method: "POST",
    body: { workspaceId },
  });
}

export async function listPayments(workspaceId: string): Promise<WorkspacePayment[]> {
  return requestApi(`/billing/payments?workspaceId=${workspaceId}`);
}
