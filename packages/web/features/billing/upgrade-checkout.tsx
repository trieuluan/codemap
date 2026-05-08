"use client";

import { useState } from "react";
import { BarChart2, Check, Cloud, Loader2, Minus, Network, RefreshCcw } from "lucide-react";
import useSWR from "swr";
import {
  PayPalSubscriptionButton,
  type OnApproveDataSubscriptions,
} from "@paypal/react-paypal-js/sdk-v6";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useSubscriptionSSE } from "@/hooks/use-subscription-sse";
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
    description: "Try CodeMap with public repositories. Good for exploring the tool before committing.",
    features: [
      "3 projects",
      "10 cloud imports / month",
      "Up to 5 000 files / import",
      "Public repositories only",
      "MCP symbol search & file reads",
      "No dependency graph or insights",
    ],
    paypalPlanKey: null,
    highlight: false,
  },
  developer: {
    label: "Developer",
    price: "$9 / mo",
    description: "Full codebase context for your AI tools. No import limits, private repos included.",
    features: [
      "Unlimited projects",
      "Unlimited cloud imports",
      "Up to 100 000 files / import",
      "Private repository imports",
      "Blast radius & impact analysis",
      "Dependency graph & insights",
      "Works with Claude, Cursor, Copilot & more",
    ],
    paypalPlanKey: "developer",
    highlight: false,
  },
  team: {
    label: "Team",
    price: "$29 / mo",
    description: "Everything in Developer, shared across your team with no file limits.",
    features: [
      "Unlimited projects",
      "Unlimited cloud imports",
      "Unlimited indexed files",
      "Private repository imports",
      "Blast radius & impact analysis",
      "Dependency graph & insights",
      "Team workspace & shared projects",
      "Works with Claude, Cursor, Copilot & more",
    ],
    paypalPlanKey: "team",
    highlight: true,
  },
};

const PLAN_OPTIONS = ["basic", "developer", "team"] as const;

const PLAN_RANK: Record<string, number> = { basic: 0, developer: 1, team: 2, beta: 3 };

function isVisiblePlan(plan: WorkspacePlan): plan is (typeof PLAN_OPTIONS)[number] {
  return plan === "basic" || plan === "developer" || plan === "team";
}

function UpgradePayPalButton({
  plan,
  workspaceId,
  isProcessing,
  onApproved,
  onError,
}: {
  plan: PaidPlan;
  workspaceId: string;
  isProcessing: boolean;
  onApproved: () => void;
  onError: () => void;
}) {
  const { toast } = useToast();

  if (isProcessing) {
    return (
      <div className="flex w-full items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm text-primary">
        <Loader2 className="size-4 animate-spin" />
        Activating plan…
      </div>
    );
  }

  return (
    <div className="w-full [&_paypal-button]:block [&_paypal-button]:w-full">
      <PayPalSubscriptionButton
        presentationMode="auto"
        createSubscription={async () => {
          const { subscriptionId } = await createSubscription({ plan, workspaceId });
          return { subscriptionId };
        }}
        onApprove={async () => {
          toast({
            title: "Payment approved",
            description: "Activating your plan — just a moment...",
          });
          onApproved();
        }}
        onError={(err: unknown) => {
          console.error("PayPal error", err);
          onError();
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
  isProcessing,
  onSubscribed,
  onApproved,
  onPaymentError,
}: {
  plan: (typeof PLAN_OPTIONS)[number];
  currentPlan: WorkspacePlan;
  workspaceId: string;
  canManageBilling: boolean;
  paypalReady: boolean;
  isProcessing: boolean;
  onSubscribed: () => void;
  onApproved: () => void;
  onPaymentError: () => void;
}) {
  const config = PLAN_CONFIG[plan];
  const isCurrent = currentPlan === plan;
  const isIncluded = !isCurrent && (PLAN_RANK[currentPlan] ?? 0) > (PLAN_RANK[plan] ?? 0);

  return (
    <div
      className={cn(
        "relative flex min-h-[360px] flex-col rounded-2xl border p-5 transition-shadow",
        config.highlight ? "border-accent-violet/40 bg-accent-violet/5" : "border-border bg-card",
        isCurrent && "ring-2 ring-accent-cyan/50",
      )}
    >
      {config.highlight ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge variant="violet">Most popular</Badge>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">{config.label}</p>
          {isCurrent ? (
            <Badge variant="cyan">Current</Badge>
          ) : null}
        </div>
        <p className="text-3xl font-semibold tracking-tight">{config.price}</p>
        <p className="min-h-10 text-sm text-muted-foreground">{config.description}</p>
      </div>

      <Separator className="my-5" />

      <ul className="space-y-3">
        {config.features.map((feature) => {
          const isLimitation = feature.startsWith("No ");
          return (
            <li key={feature} className="flex items-start gap-2 text-sm">
              {isLimitation
                ? <Minus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />
                : <Check className="mt-0.5 size-3.5 shrink-0 text-accent-emerald" />}
              <span className={isLimitation ? "text-muted-foreground" : ""}>{feature}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto pt-5">
        {isCurrent ? (
          <Button className="w-full" variant="outline" disabled>
            Current plan
          </Button>
        ) : isIncluded ? (
          <Button className="w-full" variant="outline" disabled>
            Included in your plan
          </Button>
        ) : config.paypalPlanKey && canManageBilling && paypalReady ? (
          <UpgradePayPalButton
            plan={config.paypalPlanKey}
            workspaceId={workspaceId}
            isProcessing={isProcessing}
            onApproved={onApproved}
            onError={onPaymentError}
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
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

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

  useSubscriptionSSE(workspaceId, {
    enabled: isProcessing,
    onPlanChanged: (newPlan) => {
      setIsProcessing(false);
      toast({
        title: "Plan activated",
        description: `Your workspace is now on the ${newPlan} plan.`,
      });
      void mutate();
    },
    onTimeout: () => {
      setIsProcessing(false);
      toast({
        title: "Plan pending",
        description: "Your payment was received. The plan will activate shortly — refresh if needed.",
      });
      void mutate();
    },
  });

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
                  Basic includes 20 cloud imports per month. Upgrade for higher
                  limits, private repository access, and team workspaces.
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

        {isProcessing && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
            <Loader2 className="size-4 shrink-0 animate-spin" />
            Processing your payment — activating plan, please wait…
          </div>
        )}

        <div className="grid items-stretch gap-5 lg:grid-cols-3">
          {PLAN_OPTIONS.map((plan) => (
            <PlanCard
              key={plan}
              plan={plan}
              currentPlan={currentPlan}
              workspaceId={workspaceId}
              canManageBilling={canManageBilling}
              paypalReady={Boolean(paypalClientId)}
              isProcessing={isProcessing}
              onSubscribed={() => void mutate()}
              onApproved={() => setIsProcessing(true)}
              onPaymentError={() => setIsProcessing(false)}
            />
          ))}
        </div>
      </div>
    </PayPalWrapper>
  );
}
