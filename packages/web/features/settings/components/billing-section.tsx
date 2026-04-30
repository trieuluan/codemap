"use client";

import useSWR from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { browserWorkspacesApi } from "@/features/workspaces/api";

const api = browserWorkspacesApi();

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
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {current.toLocaleString()} / {formatLimit(max)}
        </span>
      </div>
      <Progress value={usagePercent(current, max)} />
    </div>
  );
}

export function BillingSection() {
  const { data: workspaceRows, isLoading: workspacesLoading } = useSWR(
    "settings-billing-workspaces",
    () => api.listWorkspaces(),
  );
  const activeWorkspace = workspaceRows?.[0]?.workspace ?? null;
  const { data: detail, isLoading: detailLoading } = useSWR(
    activeWorkspace ? ["settings-billing-workspace", activeWorkspace.id] : null,
    ([, workspaceId]) => api.getWorkspace(workspaceId),
  );

  const isLoading = workspacesLoading || detailLoading;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Workspace plan</CardTitle>
            <CardDescription>
              Billing provider integration is planned for V2. This page shows
              the manually assigned workspace plan and current usage.
            </CardDescription>
          </div>
          <Badge variant="secondary">Provider coming later</Badge>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg border border-border/70 p-4 text-sm text-muted-foreground">
              Loading workspace plan...
            </div>
          ) : detail ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Workspace"
                value={<span className="font-medium">{detail.workspace.name}</span>}
              />
              <Stat label="Type" value={<Badge>{detail.workspace.type}</Badge>} />
              <Stat label="Plan" value={<Badge>{detail.workspace.plan}</Badge>} />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No workspace found yet. Create a project to initialize your
              personal workspace.
            </div>
          )}
        </CardContent>
      </Card>

      {detail ? (
        <Card>
          <CardHeader>
            <CardTitle>Entitlements and usage</CardTitle>
            <CardDescription>
              Usage is tracked per workspace for project creation, imports, and
              indexed graph size.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <UsageRow
              label="Projects"
              current={detail.usage.projectCount}
              max={detail.entitlements.maxProjects}
            />
            <UsageRow
              label="Imports this month"
              current={detail.usage.importsThisMonth}
              max={detail.entitlements.maxImportsPerMonth}
            />
            <UsageRow
              label="Indexed files this month"
              current={detail.usage.indexedFilesThisMonth}
              max={detail.entitlements.maxIndexedFilesPerImport}
            />
            <div className="grid gap-4 pt-2 sm:grid-cols-3">
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
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
