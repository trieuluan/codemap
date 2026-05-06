"use client";

import useSWR from "swr";
import Link from "next/link";
import { useTransition } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { cancelSubscription, listPayments } from "@/features/billing/api";
import type {
  SubscriptionStatus,
  WorkspacePlan,
  WorkspaceSubscription,
} from "@/features/workspaces/api/workspaces.types";

const api = browserWorkspacesApi();

const PLAN_CONFIG: Record<
  WorkspacePlan,
  {
    label: string;
  }
> = {
  basic: {
    label: "Basic",
  },
  beta: {
    label: "Beta",
  },
  developer: {
    label: "Developer",
  },
  team: {
    label: "Team",
  },
};

function PlanBadge({ plan }: { plan: WorkspacePlan }) {
  const colors: Record<WorkspacePlan, string> = {
    team: "bg-primary text-primary-foreground",
    developer: "bg-emerald-600 text-white",
    basic: "bg-muted text-muted-foreground",
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

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function usagePercent(current: number, max: number | null) {
  if (max === null || max <= 0) return 0;
  return Math.min(100, Math.round((current / max) * 100));
}

function SubscriptionBadge({ status }: { status: SubscriptionStatus }) {
  const className =
    status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "past_due"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : status === "trialing" || status === "paused"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-border bg-muted text-muted-foreground";

  return (
    <Badge variant="outline" className={cn("capitalize", className)}>
      {status.replace("_", " ")}
    </Badge>
  );
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

function BillingLifecycleCard({
  subscription,
  latestSubscription,
  workspaceId,
  canManageBilling,
  onChanged,
}: {
  subscription: WorkspaceSubscription | null;
  latestSubscription: WorkspaceSubscription | null;
  workspaceId?: string;
  canManageBilling: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [isCancelling, startCancel] = useTransition();
  const visibleSubscription = subscription ?? latestSubscription;
  const status = visibleSubscription?.status;
  const icon =
    status === "active" ? (
      <CheckCircle2 className="size-4 text-emerald-600" />
    ) : status === "past_due" ? (
      <AlertCircle className="size-4 text-destructive" />
    ) : (
      <CreditCard className="size-4 text-muted-foreground" />
    );

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-md border bg-background">
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium">Billing status</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {visibleSubscription
                ? `${visibleSubscription.provider} subscription for ${PLAN_CONFIG[visibleSubscription.plan].label}.`
                : "No paid subscription is attached to this workspace yet."}
            </p>
          </div>
        </div>
        {visibleSubscription ? (
          <SubscriptionBadge status={visibleSubscription.status} />
        ) : (
          <Badge variant="outline">Free plan</Badge>
        )}
      </div>

      {visibleSubscription && (
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <Stat
            label="Provider"
            value={<span className="capitalize">{visibleSubscription.provider}</span>}
          />
          <Stat
            label="Current period"
            value={
              <span>
                {formatDate(visibleSubscription.currentPeriodStart)} -{" "}
                {formatDate(visibleSubscription.currentPeriodEnd)}
              </span>
            }
          />
          <Stat
            label="Subscription ID"
            value={
              <span className="font-mono text-xs">
                {visibleSubscription.providerSubscriptionId ?? "—"}
              </span>
            }
          />
        </div>
      )}

      {latestSubscription?.status === "trialing" && !subscription && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
          PayPal approval is pending. The plan switches after PayPal confirms the
          subscription webhook.
        </div>
      )}

      {subscription ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (!workspaceId) return;
              startCancel(async () => {
                try {
                  await cancelSubscription(workspaceId);
                  toast({
                    title: "Subscription cancelled. Plan reset to Basic.",
                  });
                  onChanged();
                } catch {
                  toast({ title: "Failed to cancel", variant: "destructive" });
                }
              });
            }}
            disabled={isCancelling || !canManageBilling}
            className="text-muted-foreground hover:text-destructive"
          >
            {isCancelling ? "Cancelling..." : "Cancel subscription"}
          </Button>
          {!canManageBilling ? (
            <p className="text-xs text-muted-foreground">
              Ask a workspace owner or admin to manage billing.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function BillingSection() {
  const { activeWorkspace: activeRow, isLoading: workspacesLoading } = useWorkspace();
  const activeWorkspace = activeRow?.workspace ?? null;
  const {
    data: detail,
    isLoading: detailLoading,
    mutate,
  } = useSWR(
    activeWorkspace ? ["settings-billing-workspace", activeWorkspace.id] : null,
    ([, workspaceId]) => api.getWorkspace(workspaceId),
  );
  const { data: payments, mutate: mutatePayments } = useSWR(
    activeWorkspace ? ["billing-payments", activeWorkspace.id] : null,
    ([, workspaceId]) => listPayments(workspaceId),
  );

  const isLoading = workspacesLoading || detailLoading;
  const currentPlan = detail?.workspace.plan as WorkspacePlan | undefined;
  const canManageBilling =
    detail?.membership.role === "owner" || detail?.membership.role === "admin";

  function handleBillingChanged() {
    void mutate();
    void mutatePayments();
  }

  return (
    <>
      {/* Current plan + usage */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Current plan</CardTitle>
              <CardDescription>
                Your workspace plan and usage for this month.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {currentPlan && <PlanBadge plan={currentPlan} />}
              {activeWorkspace ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/w/${activeWorkspace.id}/upgrade`}>
                    Change plan
                  </Link>
                </Button>
              ) : null}
            </div>
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
              <BillingLifecycleCard
                subscription={detail.activeSubscription}
                latestSubscription={detail.latestSubscription}
                workspaceId={activeWorkspace?.id}
                canManageBilling={canManageBilling}
                onChanged={handleBillingChanged}
              />
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

      {/* Payment history */}
      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <CardDescription>
            Recent payment events for this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payments && payments.length > 0 ? (
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
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No payment records yet. Subscription approvals and renewals will
              appear here after PayPal confirms them.
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
