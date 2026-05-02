import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminWorkspace } from "@/features/admin/api";

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

  return (
    <div className="space-y-6">
      <div>
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
            <Link href="/admin">
              <ArrowLeft className="mr-2 size-4" />
              Admin
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{detail.workspace.name}</h1>
            <Badge variant="secondary">{detail.workspace.plan}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.workspace.type} workspace owned by {detail.workspace.owner.email}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="gap-3 py-4">
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Members
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {detail.members.length.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Projects
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {detail.projects.length.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Billing
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {activeSubscription?.status ?? "none"}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Updated
            </p>
            <p className="mt-2 text-sm font-medium">
              {formatDate(detail.workspace.updatedAt)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
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
                  <p className="truncate text-sm font-medium">
                    {member.user.name ?? "—"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.user.email}
                  </p>
                </div>
                <Badge variant="outline">{member.role}</Badge>
              </div>
            ))}
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
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Import</th>
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
                        {project.provider ?? "—"}
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
                      {shortSha(project.latestImport?.commitSha ?? null)}
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {formatDate(project.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>Billing state for this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.subscriptions.map((subscription) => (
              <div
                key={subscription.id}
                className="rounded-lg border border-border/70 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    {subscription.provider} · {subscription.plan}
                  </p>
                  <StatusBadge value={subscription.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  period ends {formatDate(subscription.currentPeriodEnd)}
                </p>
              </div>
            ))}
            {detail.subscriptions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No subscriptions yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
            <CardDescription>Recent payment records.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
