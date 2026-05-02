import Link from "next/link";
import { cookies } from "next/headers";
import { Activity, CreditCard, FolderGit2, Users, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminOverview, listAdminUsers, type AdminOverview } from "@/features/admin/api";
import { AdminUsersTable } from "@/features/admin/admin-users-table";

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

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Users;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold">{value.toLocaleString()}</p>
        </div>
        <div className="grid size-10 place-items-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function WorkspacesPanel({ workspaces }: { workspaces: AdminOverview["workspaces"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspaces</CardTitle>
        <CardDescription>Recent workspaces across the system.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {workspaces.map((workspace) => (
          <div
            key={workspace.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-border/70 p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{workspace.name}</p>
                <Badge variant="secondary">{workspace.plan}</Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {workspace.owner.email} · {workspace.memberCount} members ·{" "}
                {workspace.projectCount} projects
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/workspaces/${workspace.id}`}>Open</Link>
            </Button>
          </div>
        ))}
        {workspaces.length === 0 && (
          <p className="text-sm text-muted-foreground">No workspaces yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectsPanel({ projects }: { projects: AdminOverview["projects"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>Latest projects and import state.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Project</th>
              <th className="pb-2 font-medium">Workspace</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Import</th>
              <th className="pb-2 font-medium">Commit</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id} className="border-b border-border/70 last:border-0">
                <td className="py-3">
                  <p className="font-medium">{project.name}</p>
                  <p className="text-xs text-muted-foreground">{project.provider ?? "—"}</p>
                </td>
                <td className="py-3 text-muted-foreground">{project.workspaceName}</td>
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
                  {shortSha(project.latestImport?.commitSha ?? null)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ImportsPanel({ imports }: { imports: AdminOverview["imports"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Imports</CardTitle>
        <CardDescription>Latest import and parse activity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {imports.map((item) => (
          <div key={item.id} className="rounded-lg border border-border/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.projectName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.workspaceName} · {item.triggeredBy.email} · {formatDate(item.startedAt)}
                </p>
              </div>
              <StatusBadge value={item.parseStatus} />
            </div>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {shortSha(item.commitSha)} · {item.indexedFileCount.toLocaleString()} files ·{" "}
              {item.indexedSymbolCount.toLocaleString()} symbols ·{" "}
              {item.indexedEdgeCount.toLocaleString()} edges
            </p>
          </div>
        ))}
        {imports.length === 0 && (
          <p className="text-sm text-muted-foreground">No imports yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function BillingPanel({
  subscriptions,
  payments,
}: {
  subscriptions: AdminOverview["subscriptions"];
  payments: AdminOverview["payments"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>Subscriptions and recent payment events.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-sm font-medium">Subscriptions</p>
          {subscriptions.map((subscription) => (
            <div key={subscription.id} className="rounded-lg border border-border/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">{subscription.workspaceName}</p>
                <StatusBadge value={subscription.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {subscription.provider} · {subscription.plan} · renews{" "}
                {formatDate(subscription.currentPeriodEnd)}
              </p>
            </div>
          ))}
          {subscriptions.length === 0 && (
            <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Payments</p>
          {payments.map((payment) => (
            <div key={payment.id} className="rounded-lg border border-border/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">{payment.workspaceName}</p>
                <StatusBadge value={payment.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {payment.amount ?? "—"} {payment.currency} · {payment.provider} ·{" "}
                {formatDate(payment.createdAt)}
              </p>
            </div>
          ))}
          {payments.length === 0 && (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function AdminPage() {
  const cookieHeader = (await cookies()).toString();
  const [overview, usersResponse] = await Promise.all([
    getAdminOverview(cookieHeader),
    listAdminUsers({ page: 1, pageSize: 10 }, cookieHeader),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Global view across users, workspaces, projects, imports, and billing.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Users" value={overview.stats.users} icon={Users} />
        <StatCard label="Workspaces" value={overview.stats.workspaces} icon={Workflow} />
        <StatCard label="Projects" value={overview.stats.projects} icon={FolderGit2} />
        <StatCard label="Imports" value={overview.stats.imports} icon={Activity} />
        <StatCard
          label="Active subs"
          value={overview.stats.activeSubscriptions}
          icon={CreditCard}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <WorkspacesPanel workspaces={overview.workspaces} />
        <ProjectsPanel projects={overview.projects} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <ImportsPanel imports={overview.imports} />
        <BillingPanel
          subscriptions={overview.subscriptions}
          payments={overview.payments}
        />
      </div>

      <AdminUsersTable initialResponse={usersResponse} />
    </div>
  );
}
