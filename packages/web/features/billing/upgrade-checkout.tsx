"use client";

import useSWR from "swr";
import { BarChart2, Check, Cloud, Network, RefreshCcw } from "lucide-react";
import {
  PayPalSubscriptionButton,
  type OnApproveDataSubscriptions,
} from "@paypal/react-paypal-js/sdk-v6";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { browserWorkspacesApi } from "@/features/workspaces/api";
import type { WorkspaceDetail, WorkspacePlan } from "@/features/workspaces/api";
import { createSubscription } from "@/features/billing/api";
import PayPalWrapper from "@/features/billing/paypal-wrapper";

type PaidPlan = "developer" | "team";

const PLAN_CONFIG: Record<
  "basic" | "developer" | "team",
  {
    label: string;
    price: string;
    description: string;
    features: string[];
    paypalPlanKey: PaidPlan | null;
    highlight: boolean;
  }
> = {
  basic: {
    label: "Basic",
    price: "Free",
    description: "Local MCP index for day-to-day coding work.",
    features: [
      "5 projects",
      "Local MCP search and file reads",
      "No cloud imports",
      "No web graph or insights",
    ],
    paypalPlanKey: null,
    highlight: false,
  },
  developer: {
    label: "Developer",
    price: "$19 / mo",
    description: "Cloud indexing for solo developers.",
    features: [
      "20 projects",
      "200 cloud imports / month",
      "50 000 files / import",
      "Private repository imports",
      "Web graph and insights",
    ],
    paypalPlanKey: "developer",
    highlight: false,
  },
  team: {
    label: "Team",
    price: "$49 / mo",
    description: "Unlimited cloud indexing for teams.",
    features: [
      "Unlimited projects",
      "Unlimited cloud imports",
      "Unlimited indexed files",
      "Private repository imports",
      "Team workspace",
    ],
    paypalPlanKey: "team",
    highlight: true,
  },
};

const PLAN_OPTIONS = ["basic", "developer", "team"] as const;

function isVisiblePlan(plan: WorkspacePlan): plan is (typeof PLAN_OPTIONS)[number] {
  return plan === "basic" || plan === "developer" || plan === "team";
}

function UpgradePayPalButton({
  plan,
  workspaceId,
  onSuccess,
}: {
  plan: PaidPlan;
  workspaceId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();

  return (
    <div className="w-full [&_paypal-button]:block [&_paypal-button]:w-full">
      <PayPalSubscriptionButton
        presentationMode="auto"
        createSubscription={async () => {
          const { subscriptionId } = await createSubscription({
            plan,
            workspaceId,
          });
          return { subscriptionId };
        }}
        onApprove={async (data: OnApproveDataSubscriptions) => {
          toast({
            title: "Subscription activated",
            description: data.subscriptionId
              ? `PayPal subscription ${data.subscriptionId} is now active.`
              : "PayPal confirmed the subscription.",
          });
          onSuccess();
        }}
        onError={(err: unknown) => {
          console.error("PayPal error", err);
          toast({
            title: "Payment failed",
            description: "Please try again.",
            variant: "destructive",
          });
        }}
        onCancel={() => {
          toast({ title: "Payment cancelled" });
        }}
      />
    </div>
  );
}

function PlanCard({
  plan,
  currentPlan,
  workspaceId,
  canManageBilling,
  paypalReady,
  onSubscribed,
}: {
  plan: (typeof PLAN_OPTIONS)[number];
  currentPlan: WorkspacePlan;
  workspaceId: string;
  canManageBilling: boolean;
  paypalReady: boolean;
  onSubscribed: () => void;
}) {
  const config = PLAN_CONFIG[plan];
  const isCurrent = currentPlan === plan;

  return (
    <div
      className={cn(
        "relative flex min-h-[360px] flex-col rounded-lg border p-5",
        config.highlight ? "border-primary/50 bg-primary/5" : "border-border bg-card",
        isCurrent && "ring-2 ring-primary",
      )}
    >
      {config.highlight ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground">Most popular</Badge>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">{config.label}</p>
          {isCurrent ? (
            <Badge variant="outline" className="border-primary text-primary">
              Current
            </Badge>
          ) : null}
        </div>
        <p className="text-3xl font-semibold tracking-tight">{config.price}</p>
        <p className="min-h-10 text-sm text-muted-foreground">{config.description}</p>
      </div>

      <Separator className="my-5" />

      <ul className="space-y-3">
        {config.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-5">
        {isCurrent ? (
          <Button className="w-full" variant="outline" disabled>
            Current plan
          </Button>
        ) : config.paypalPlanKey && canManageBilling && paypalReady ? (
          <UpgradePayPalButton
            plan={config.paypalPlanKey}
            workspaceId={workspaceId}
            onSuccess={onSubscribed}
          />
        ) : config.paypalPlanKey && !canManageBilling ? (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Ask a workspace owner or admin to upgrade this workspace.
          </div>
        ) : config.paypalPlanKey ? (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            PayPal checkout is not configured for this environment.
          </div>
        ) : (
          <Button className="w-full" variant="outline" disabled>
            Included
          </Button>
        )}
      </div>
    </div>
  );
}

function ValueItem({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Cloud;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <Icon className="mb-3 size-5 text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function UpgradeCheckout({
  workspaceId,
  initialDetail,
  paypalClientId,
}: {
  workspaceId: string;
  initialDetail: WorkspaceDetail;
  paypalClientId?: string;
}) {
  const api = browserWorkspacesApi();
  const { data: detail, mutate } = useSWR(
    ["upgrade-workspace", workspaceId],
    () => api.getWorkspace(workspaceId),
    { fallbackData: initialDetail },
  );
  const currentPlan = detail.workspace.plan;
  const displayPlan = isVisiblePlan(currentPlan) ? currentPlan : "team";
  const canManageBilling =
    detail.membership.role === "owner" || detail.membership.role === "admin";

  return (
    <PayPalWrapper clientId={paypalClientId}>
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-5">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr] lg:items-end">
            <div className="space-y-3">
              <div className="flex size-11 items-center justify-center rounded-lg border border-border bg-background">
                <Cloud className="size-5 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight">
                  Upgrade for cloud indexing
                </h1>
                <p className="max-w-2xl text-muted-foreground">
                  Keep local MCP indexing on Basic, or unlock cloud imports,
                  dependency graph, and project insights for the web app.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{detail.workspace.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Current plan: {currentPlan === "beta" ? "Legacy beta" : PLAN_CONFIG[displayPlan].label}
                  </p>
                </div>
                <Badge variant={detail.entitlements.cloudImportAccess ? "default" : "outline"}>
                  {detail.entitlements.cloudImportAccess ? "Cloud enabled" : "Local only"}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <ValueItem
            icon={RefreshCcw}
            title="Cloud imports"
            description="Run full repository imports and re-import after code changes."
          />
          <ValueItem
            icon={Network}
            title="Dependency graph"
            description="Explore folder, file, and symbol relationships in the browser."
          />
          <ValueItem
            icon={BarChart2}
            title="Project insights"
            description="Review structure and dependency findings from cloud indexing."
          />
        </div>

        {!canManageBilling ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            You can compare plans here, but only workspace owners and admins can
            start checkout.
          </div>
        ) : null}

        <div className="grid items-stretch gap-5 lg:grid-cols-3">
          {PLAN_OPTIONS.map((plan) => (
            <PlanCard
              key={plan}
              plan={plan}
              currentPlan={currentPlan}
              workspaceId={workspaceId}
              canManageBilling={canManageBilling}
              paypalReady={Boolean(paypalClientId)}
              onSubscribed={() => void mutate()}
            />
          ))}
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          PayPal confirms subscriptions asynchronously. If checkout completes
          but the plan does not update immediately, refresh this page after the
          webhook arrives.
        </div>
      </div>
    </PayPalWrapper>
  );
}
