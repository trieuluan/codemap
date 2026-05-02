import Link from "next/link";
import { cookies } from "next/headers";
import {
  ArrowLeft,
  CreditCard,
  FolderGit2,
  GitBranch,
  Hash,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getAdminWorkspace, type AdminWorkspaceDetail } from "@/features/admin/api";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortSha(value: string | null) {
  return value ? value.slice(0, 7) : "—";
}

function shortId(value: string | null) {
  return value ? `${value.slice(0, 10)}…` : "—";
}

function formatRepository(value: string | null) {
  if (!value) return "—";
  return value
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/\.git$/, "");
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function StatusBadge({ value }: { value: string }) {
  const className =
    value === "completed" || value === "ready" || value === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : value === "failed" || value === "past_due"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : value === "running" || value === "queued" || value === "trialing"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-border bg-muted text-muted-foreground";

  return (
    <Badge variant="outline" className={className}>
      {value}
    </Badge>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description?: string;
  icon: typeof Users;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 truncate text-2xl font-semibold">{value}</p>
          {description && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function WorkspaceFacts({ detail }: { detail: AdminWorkspaceDetail }) {
  const ownerMember = detail.members.find(
    (member) => member.userId === detail.workspace.owner.id,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace facts</CardTitle>
        <CardDescription>
          Ownership, routing, and operational identifiers.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Owner
          </p>
          <p className="mt-1 font-medium">
            {detail.workspace.owner.name ?? "—"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {detail.workspace.owner.email}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Slug
          </p>
          <p className="mt-1 font-mono text-xs">{detail.workspace.slug}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Workspace ID
          </p>
          <p className="mt-1 font-mono text-xs">{detail.workspace.id}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Owner role
          </p>
          <p className="mt-1 capitalize">
            {ownerMember?.role ?? "not a member"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function AdminWorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const cookieHeader = (await cookies()).toString();
  const detail = await getAdminWorkspace(workspaceId, cookieHeader);
  const activeSubscription = detail.subscriptions.find(
    (subscription) => subscription.status === "active",
  );
  const latestSubscription = detail.subscriptions[0] ?? null;
  const latestPayment = detail.payments[0] ?? null;
  const latestImport = detail.projects
    .map((project) => project.latestImport)
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    })[0];
  const importTotals = detail.projects.reduce(
    (totals, project) => {
      if (!project.latestImport) return totals;
      totals.files += project.latestImport.indexedFileCount;
      totals.symbols += project.latestImport.indexedSymbolCount;
      totals.edges += project.latestImport.indexedEdgeCount;
      return totals;
    },
    { files: 0, symbols: 0, edges: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/admin">
              <ArrowLeft className="mr-2 size-4" />
              Admin
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{detail.workspace.name}</h1>
            <Badge variant="secondary" className="capitalize">
              {detail.workspace.plan}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {detail.workspace.type}
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            System-admin view for workspace ownership, projects, imports,
            membership, and billing records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin">All workspaces</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin?workspace=${detail.workspace.id}`}>
              Audit in overview
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Members"
          value={formatNumber(detail.members.length)}
          description={`${detail.members.filter((m) => m.role === "owner").length} owner`}
          icon={Users}
        />
        <MetricCard
          label="Projects"
          value={formatNumber(detail.projects.length)}
          description={`${formatNumber(importTotals.files)} indexed files`}
          icon={FolderGit2}
        />
        <MetricCard
          label="Latest import"
          value={latestImport ? shortSha(latestImport.commitSha) : "none"}
          description={
            latestImport
              ? `${latestImport.parseStatus} · ${formatDate(latestImport.completedAt)}`
              : "No imports indexed"
          }
          icon={GitBranch}
        />
        <MetricCard
          label="Billing"
          value={activeSubscription?.plan ?? detail.workspace.plan}
          description={
            activeSubscription
              ? `${activeSubscription.status} · ${activeSubscription.provider}`
              : latestSubscription
                ? `${latestSubscription.status} · ${latestSubscription.provider}`
                : "No subscription"
          }
          icon={CreditCard}
        />
      </div>

      <WorkspaceFacts detail={detail} />

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>Users assigned to this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between gap-4 rounded-lg border border-border/70 p-3"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {member.user.name ?? "—"}
                    </p>
                    {member.userId === detail.workspace.owner.id && (
                      <Badge variant="secondary" className="text-xs">
                        Owner account
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.user.email}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Joined {formatDate(member.createdAt)}
                  </p>
                </div>
                <Badge variant="outline" className="capitalize">
                  {member.role}
                </Badge>
              </div>
            ))}
            {detail.members.length === 0 && (
              <EmptyState>No workspace members found.</EmptyState>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>Workspace projects visible to system admin.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Project</th>
                  <th className="pb-2 font-medium">Repository</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Import</th>
                  <th className="pb-2 font-medium">Indexed</th>
                  <th className="pb-2 font-medium">Commit</th>
                  <th className="pb-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {detail.projects.map((project) => (
                  <tr
                    key={project.id}
                    className="border-b border-border/70 last:border-0"
                  >
                    <td className="py-3">
                      <p className="font-medium">{project.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {project.visibility} · {project.provider ?? "local"}
                      </p>
                    </td>
                    <td className="max-w-[220px] py-3">
                      <p className="truncate text-xs text-muted-foreground">
                        {formatRepository(project.repositoryUrl)}
                      </p>
                    </td>
                    <td className="py-3">
                      <StatusBadge value={project.status} />
                    </td>
                    <td className="py-3">
                      {project.latestImport ? (
                        <StatusBadge value={project.latestImport.parseStatus} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 font-mono text-xs text-muted-foreground">
                      {project.latestImport
                        ? `${formatNumber(project.latestImport.indexedFileCount)}f / ${formatNumber(project.latestImport.indexedSymbolCount)}s / ${formatNumber(project.latestImport.indexedEdgeCount)}e`
                        : "—"}
                    </td>
                    <td className="py-3 font-mono text-xs text-muted-foreground">
                      {shortSha(project.latestImport?.commitSha ?? null)}
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {formatDate(project.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.projects.length === 0 && (
              <div className="mt-4">
                <EmptyState>No projects in this workspace yet.</EmptyState>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>
              Provider lifecycle and current billing period.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.subscriptions.map((subscription) => (
              <div
                key={subscription.id}
                className="rounded-lg border border-border/70 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {subscription.provider} · {subscription.plan}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {shortId(subscription.providerSubscriptionId)}
                    </p>
                  </div>
                  <StatusBadge value={subscription.status} />
                </div>
                <Separator className="my-3" />
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>
                    Period: {formatDate(subscription.currentPeriodStart)} -{" "}
                    {formatDate(subscription.currentPeriodEnd)}
                  </span>
                  <span>Cancelled: {formatDate(subscription.cancelledAt)}</span>
                  <span className="font-mono">
                    Provider ID: {shortId(subscription.providerSubscriptionId)}
                  </span>
                  <span>Updated: {formatDate(subscription.updatedAt)}</span>
                </div>
              </div>
            ))}
            {detail.subscriptions.length === 0 && (
              <EmptyState>No subscriptions yet.</EmptyState>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
            <CardDescription>Recent payment records.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestPayment && (
              <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Latest payment</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {latestPayment.amount ?? "—"} {latestPayment.currency} ·{" "}
                      {latestPayment.provider} · {formatDate(latestPayment.createdAt)}
                    </p>
                  </div>
                  <StatusBadge value={latestPayment.status} />
                </div>
              </div>
            )}
            {detail.payments.map((payment) => (
              <div key={payment.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    {payment.amount ?? "—"} {payment.currency}
                  </p>
                  <StatusBadge value={payment.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {payment.provider} · {payment.plan} · {formatDate(payment.createdAt)}
                </p>
              </div>
            ))}
            {detail.payments.length === 0 && (
              <EmptyState>No payments yet.</EmptyState>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Indexed totals</CardTitle>
          <CardDescription>
            Sum of each project's latest import, useful for quick admin sizing.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 p-4">
            <Hash className="mb-3 size-4 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Files
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatNumber(importTotals.files)}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 p-4">
            <Hash className="mb-3 size-4 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Symbols
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatNumber(importTotals.symbols)}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 p-4">
            <Hash className="mb-3 size-4 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dependencies
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatNumber(importTotals.edges)}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
