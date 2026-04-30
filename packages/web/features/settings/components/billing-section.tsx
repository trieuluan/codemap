"use client";

import useSWR from "swr";
import { useTransition } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { browserWorkspacesApi } from "@/features/workspaces/api";
import {
  createSubscription,
  cancelSubscription,
  listPayments,
} from "@/features/billing/api";
import type { WorkspacePlan } from "@/features/workspaces/api/workspaces.types";
import type { OnApproveData } from "@paypal/paypal-js";

const api = browserWorkspacesApi();

const PLAN_CONFIG: Record<
  WorkspacePlan,
  {
    label: string;
    price: string;
    description: string;
    features: string[];
    highlight: boolean;
    paypalPlanKey: "developer" | "team" | null;
  }
> = {
  beta: {
    label: "Beta",
    price: "Free",
    description: "Early access — all limits unlocked during beta.",
    features: [
      "Unlimited projects",
      "Unlimited imports / month",
      "MCP access",
      "Private repo imports",
    ],
    highlight: false,
    paypalPlanKey: null,
  },
  developer: {
    label: "Developer",
    price: "$19 / mo",
    description: "For solo developers and small projects.",
    features: [
      "20 projects",
      "200 imports / month",
      "50 000 files / import",
      "MCP access",
      "Private repo imports",
    ],
    highlight: false,
    paypalPlanKey: "developer",
  },
  team: {
    label: "Team",
    price: "$49 / mo",
    description: "For teams that need unlimited scale.",
    features: [
      "Unlimited projects",
      "Unlimited imports / month",
      "Unlimited indexed files",
      "MCP access",
      "Private repo imports",
      "Team workspace",
    ],
    highlight: true,
    paypalPlanKey: "team",
  },
};

function PlanBadge({ plan }: { plan: WorkspacePlan }) {
  const colors: Record<WorkspacePlan, string> = {
    team: "bg-primary text-primary-foreground",
    developer: "bg-emerald-600 text-white",
    beta: "bg-muted text-muted-foreground",
  };
  return (
    <Badge className={cn("capitalize", colors[plan])}>
      {PLAN_CONFIG[plan].label}
    </Badge>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function formatLimit(value: number | null) {
  return value === null ? "Unlimited" : value.toLocaleString();
}

function usagePercent(current: number, max: number | null) {
  if (max === null || max <= 0) return 0;
  return Math.min(100, Math.round((current / max) * 100));
}

function UsageRow({
  label,
  current,
  max,
}: {
  label: string;
  current: number;
  max: number | null;
}) {
  const pct = usagePercent(current, max);
  const isWarning = max !== null && pct >= 80;
  const isCritical = max !== null && pct >= 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={cn(
            "font-mono",
            isCritical
              ? "text-destructive font-semibold"
              : isWarning
                ? "text-amber-500"
                : "",
          )}
        >
          {current.toLocaleString()} / {formatLimit(max)}
        </span>
      </div>
      <Progress
        value={pct}
        className={cn(
          isCritical
            ? "[&>div]:bg-destructive"
            : isWarning
              ? "[&>div]:bg-amber-500"
              : "",
        )}
      />
    </div>
  );
}

function PayPalButton({
  plan,
  workspaceId,
  onSuccess,
}: {
  plan: "developer" | "team";
  workspaceId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();

  return (
    <PayPalButtons
      style={{
        layout: "horizontal",
        color: "blue",
        shape: "rect",
        label: "subscribe",
        height: 36,
      }}
      createSubscription={async () => {
        const { subscriptionId } = await createSubscription({
          plan,
          workspaceId,
        });
        return subscriptionId;
      }}
      onApprove={async (data: OnApproveData) => {
        toast({
          title: "Subscription activated!",
          description: data.subscriptionID
            ? `ID: ${data.subscriptionID}`
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
  );
}

function PlanCard({
  plan,
  current,
  workspaceId,
  onSubscribed,
}: {
  plan: WorkspacePlan;
  current: boolean;
  workspaceId?: string;
  onSubscribed: () => void;
}) {
  const config = PLAN_CONFIG[plan];
  const { toast } = useToast();
  const [isCancelling, startCancel] = useTransition();

  function handleCancel() {
    if (!workspaceId) return;
    startCancel(async () => {
      try {
        await cancelSubscription(workspaceId);
        toast({ title: "Subscription cancelled. Plan reset to Beta." });
        onSubscribed();
      } catch {
        toast({ title: "Failed to cancel", variant: "destructive" });
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-5 space-y-4 relative",
        config.highlight
          ? "border-primary/50 bg-primary/5"
          : "border-border/70 bg-card",
        current && "ring-2 ring-primary",
      )}
    >
      {config.highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground text-xs px-3">
            Most popular
          </Badge>
        </div>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="font-semibold">{config.label}</p>
          {current && (
            <Badge
              variant="outline"
              className="text-xs border-primary text-primary"
            >
              Current
            </Badge>
          )}
        </div>
        <p className="text-2xl font-bold">{config.price}</p>
        <p className="text-xs text-muted-foreground">{config.description}</p>
      </div>

      <Separator />

      <ul className="space-y-2">
        {config.features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm">
            <Check className="size-3.5 shrink-0 text-emerald-500" />
            {f}
          </li>
        ))}
      </ul>

      {!current && config.paypalPlanKey && workspaceId ? (
        <PayPalButton
          plan={config.paypalPlanKey}
          workspaceId={workspaceId}
          onSuccess={onSubscribed}
        />
      ) : current && plan !== "beta" ? (
        <button
          onClick={handleCancel}
          disabled={isCancelling}
          className="w-full text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive transition-colors disabled:opacity-50"
        >
          {isCancelling ? "Cancelling…" : "Cancel subscription"}
        </button>
      ) : null}
    </div>
  );
}

export function BillingSection() {
  const { data: workspaceRows, isLoading: workspacesLoading } = useSWR(
    "settings-billing-workspaces",
    () => api.listWorkspaces(),
  );
  const activeWorkspace = workspaceRows?.[0]?.workspace ?? null;
  const {
    data: detail,
    isLoading: detailLoading,
    mutate,
  } = useSWR(
    activeWorkspace ? ["settings-billing-workspace", activeWorkspace.id] : null,
    ([, workspaceId]) => api.getWorkspace(workspaceId),
  );
  const { data: payments } = useSWR(
    activeWorkspace ? ["billing-payments", activeWorkspace.id] : null,
    ([, workspaceId]) => listPayments(workspaceId),
  );

  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const isLoading = workspacesLoading || detailLoading;
  const currentPlan = detail?.workspace.plan as WorkspacePlan | undefined;

  function handleSubscribed() {
    void mutate();
  }

  const content = (
    <>
      {/* Current plan + usage */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Current plan</CardTitle>
              <CardDescription>
                Your workspace plan and usage for this month.
              </CardDescription>
            </div>
            {currentPlan && <PlanBadge plan={currentPlan} />}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg border border-border/70 p-4 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : detail ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3 text-sm">
                <Stat
                  label="Workspace"
                  value={
                    <span className="font-medium">{detail.workspace.name}</span>
                  }
                />
                <Stat
                  label="Private repos"
                  value={
                    detail.entitlements.privateRepoImports
                      ? "Enabled"
                      : "Disabled"
                  }
                />
                <Stat
                  label="MCP access"
                  value={detail.entitlements.mcpAccess ? "Enabled" : "Disabled"}
                />
              </div>
              <Separator />
              <div className="space-y-4">
                <p className="text-sm font-medium">Usage this month</p>
                <UsageRow
                  label="Projects"
                  current={detail.usage.projectCount}
                  max={detail.entitlements.maxProjects}
                />
                <UsageRow
                  label="Imports"
                  current={detail.usage.importsThisMonth}
                  max={detail.entitlements.maxImportsPerMonth}
                />
                <UsageRow
                  label="Indexed files"
                  current={detail.usage.indexedFilesThisMonth}
                  max={detail.entitlements.maxIndexedFilesPerImport}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat
                  label="Symbols indexed"
                  value={
                    <span className="font-mono">
                      {detail.usage.indexedSymbolsThisMonth.toLocaleString()}
                    </span>
                  }
                />
                <Stat
                  label="Edges indexed"
                  value={
                    <span className="font-mono">
                      {detail.usage.indexedEdgesThisMonth.toLocaleString()}
                    </span>
                  }
                />
                <Stat
                  label="MCP sessions"
                  value={
                    <span className="font-mono">
                      {detail.usage.mcpSessionsCreatedThisMonth.toLocaleString()}
                    </span>
                  }
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No workspace found yet. Create a project to initialize your
              personal workspace.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plans */}
      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>
            Upgrade or downgrade your workspace plan. Payments processed via
            PayPal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-3">
            {(["beta", "developer", "team"] as WorkspacePlan[]).map((plan) => (
              <PlanCard
                key={plan}
                plan={plan}
                current={currentPlan === plan}
                workspaceId={activeWorkspace?.id}
                onSubscribed={handleSubscribed}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Payment history */}
      {payments && payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payment history</CardTitle>
            <CardDescription>
              Recent payments for this workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70">
                    <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                      Date
                    </th>
                    <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                      Plan
                    </th>
                    <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                      Amount
                    </th>
                    <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                      Provider
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="py-2 text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2 capitalize">{p.plan}</td>
                      <td className="py-2 font-mono">
                        {p.amount ? `${p.amount} ${p.currency}` : "—"}
                      </td>
                      <td className="py-2">
                        <Badge
                          variant={
                            p.status === "completed" ? "default" : "destructive"
                          }
                          className="text-xs capitalize"
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td className="py-2 capitalize text-muted-foreground">
                        {p.provider}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );

  if (!paypalClientId) return content;

  return (
    <PayPalScriptProvider
      options={{
        clientId: paypalClientId,
        vault: true,
        intent: "subscription",
      }}
    >
      {content}
    </PayPalScriptProvider>
  );
}
