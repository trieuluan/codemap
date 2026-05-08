import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BarChart2,
  Clock,
  History,
  Network,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LocalProjectDate } from "@/features/projects/components/local-project-date";
import type { ProjectListItem } from "@/features/projects/api";

function shortSha(value?: string | null) {
  return value ? value.slice(0, 7) : "—";
}

function getProjectSortTime(project: ProjectListItem) {
  const latestImport = project.latestImport;
  const value =
    latestImport?.completedAt ??
    latestImport?.startedAt ??
    project.lastImportedAt ??
    project.updatedAt;
  return value ? new Date(value).getTime() : 0;
}

export function pickActiveProject(projects: ProjectListItem[]) {
  return (
    [...projects].sort(
      (a, b) => getProjectSortTime(b) - getProjectSortTime(a),
    )[0] ?? null
  );
}

function getIndexState(project: ProjectListItem) {
  const latestImport = project.latestImport;

  if (!latestImport) {
    return {
      label: "No import yet",
      tone: "muted" as const,
      description: "Run the first import before opening code maps.",
    };
  }

  if (
    project.status === "importing" ||
    latestImport.status === "pending" ||
    latestImport.status === "queued" ||
    latestImport.status === "running" ||
    latestImport.parseStatus === "queued" ||
    latestImport.parseStatus === "running" ||
    latestImport.parseStatus === "pending"
  ) {
    return {
      label: "Importing",
      tone: "warning" as const,
      description: "The latest import is still being indexed.",
    };
  }

  if (
    project.status === "failed" ||
    latestImport.status === "failed" ||
    latestImport.parseStatus === "failed"
  ) {
    return {
      label: "Needs attention",
      tone: "danger" as const,
      description:
        "The latest import failed. Review history or retry from the project page.",
    };
  }

  if (
    latestImport.status === "completed" &&
    latestImport.parseStatus === "completed"
  ) {
    return {
      label: "Index ready",
      tone: "ready" as const,
      description: "Explorer, Graph, and Insights are ready for this project.",
    };
  }

  if (latestImport.parseStatus === "partial") {
    return {
      label: "Partial index",
      tone: "warning" as const,
      description: "The map is usable, but some files could not be parsed.",
    };
  }

  return {
    label: "Index pending",
    tone: "muted" as const,
    description: "Open project history for the latest import details.",
  };
}

function IndexToneBadge({
  tone,
  label,
}: {
  tone: ReturnType<typeof getIndexState>["tone"];
  label: string;
}) {
  const className =
    tone === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "danger"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-muted-foreground";

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

export function WorkspaceIndexCard({
  project,
  workspaceId,
}: {
  project: ProjectListItem | null;
  workspaceId: string;
}) {
  if (!project) return null;

  const latestImport = project.latestImport ?? null;
  const indexState = getIndexState(project);
  const projectHref = `/w/${workspaceId}/projects/${project.id}`;
  const canOpenMap =
    latestImport?.status === "completed" &&
    (latestImport.parseStatus === "completed" ||
      latestImport.parseStatus === "partial");

  return (
    <Card className="border-border/80">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">Current project index</p>
              <IndexToneBadge tone={indexState.tone} label={indexState.label} />
            </div>
            <div>
              <Link
                href={projectHref}
                className="text-xl font-semibold tracking-tight underline-offset-4 hover:underline"
              >
                {project.name}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">
                {indexState.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canOpenMap ? (
              <>
                <Button asChild size="sm">
                  <Link href={`${projectHref}/explorer`}>
                    <Workflow className="size-3.5" />
                    Explorer
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`${projectHref}/graph`}>
                    <Network className="size-3.5" />
                    Graph
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`${projectHref}/insights`}>
                    <BarChart2 className="size-3.5" />
                    Insights
                  </Link>
                </Button>
              </>
            ) : (
              <Button asChild size="sm">
                <Link href={projectHref}>
                  <ArrowRight className="size-3.5" />
                  Open project
                </Link>
              </Button>
            )}
            <Button asChild size="sm" variant="ghost">
              <Link href={`${projectHref}/history`}>
                <History className="size-3.5" />
                History
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-border/70 glass p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Latest import
            </p>
            <p className="mt-1 text-sm font-medium">
              {latestImport ? (
                <LocalProjectDate
                  value={latestImport.completedAt ?? latestImport.startedAt}
                />
              ) : (
                "Never"
              )}
            </p>
          </div>
          <div className="rounded-md border border-border/70 glass p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Commit
            </p>
            <p className="mt-1 font-mono text-sm">
              {shortSha(latestImport?.commitSha)}
            </p>
          </div>
          <div className="rounded-md border border-border/70 glass p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Indexed
            </p>
            <p className="mt-1 text-sm font-medium">
              {(latestImport?.indexedFileCount ?? 0).toLocaleString()} files ·{" "}
              {(latestImport?.indexedSymbolCount ?? 0).toLocaleString()} symbols
            </p>
          </div>
          <div className="rounded-md border border-border/70 glass p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
              {indexState.tone === "danger" ? (
                <AlertCircle className="size-3.5 text-destructive" />
              ) : (
                <Clock className="size-3.5 text-muted-foreground" />
              )}
              {latestImport?.parseStatus ?? project.status}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
