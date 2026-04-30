"use client";

import Link from "next/link";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BarChart2,
  BookOpen,
  Clock,
  ExternalLink,
  FileCode2,
  GitBranch,
  History,
  Loader2,
  Network,
  Pencil,
  RefreshCcw,
  Share2,
  Trash2,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import {
  browserProjectsApi,
  ProjectsApiError,
  triggerProjectImport,
  type Project,
  type ProjectImport,
  type ProjectImportParseStatus,
} from "@/features/projects/api";
import { ProjectStatusBadge } from "../components/project-status-badge";
import { ProjectVisibilityBadge } from "../components/project-visibility-badge";
import {
  formatProjectImportAnalysisCount,
  getProjectImportAnalysisStats,
  getProjectImportParseStatusLabel,
  getProjectRepositoryLabel,
} from "../utils/project-helpers";
import { LocalProjectDate } from "../components/local-project-date";
import { ProjectImportStatusBadge } from "../components/project-import-status-badge";
import { DeleteProjectDialog } from "../list/components/delete-project-dialog";
import { EditProjectDialog } from "./components/edit-project-dialog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

// Fix #5: local_workspace không có repositoryUrl nhưng vẫn có thể re-import
function canTriggerImport(project: Project) {
  return Boolean(project.repositoryUrl) || project.provider === "local_workspace";
}

export function ProjectOverview({
  initialProject,
  initialImports,
}: {
  initialProject: Project;
  initialImports: ProjectImport[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [isImportPending, startImportTransition] = useTransition();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const projectId = initialProject.id;
  const sentinelRef = useRef<HTMLDivElement>(null);

  const swrBase = {
    revalidateOnFocus: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    revalidateOnMount: false,
    revalidateIfStale: false,
    revalidateOnReconnect: true,
    dedupingInterval: 3000,
  } as const;

  const { data: project, mutate: mutateProject } = useSWR(
    ["project", projectId],
    () => browserProjectsApi.getProject(projectId),
    {
      ...swrBase,
      fallbackData: initialProject,
      refreshInterval: (p?: Project) => (p?.status === "importing" ? 3000 : 0),
    },
  );

  type ImportPage = { data: ProjectImport[]; nextCursor: string | null };

  const {
    data: pages,
    size,
    setSize,
    mutate: mutateImports,
    isValidating,
  } = useSWRInfinite<ImportPage>(
    (pageIndex: number, previousPage: ImportPage | null) => {
      if (previousPage && !previousPage.nextCursor) return null;
      const cursor = previousPage?.nextCursor ?? undefined;
      return ["project-imports-page", projectId, pageIndex, cursor];
    },
    ([, pid, , cursor]: [string, string, number, string | undefined]) =>
      browserProjectsApi
        .getProjectImportPage(pid, { limit: PAGE_SIZE, cursor })
        .then((res) => ({ data: res.data, nextCursor: res.meta?.nextCursor ?? null })),
    {
      ...swrBase,
      fallbackData: [
        {
          data: initialImports.slice(0, PAGE_SIZE),
          nextCursor:
            initialImports.length > PAGE_SIZE
              ? (initialImports[PAGE_SIZE - 1]?.startedAt ?? null)
              : null,
        },
      ],
      refreshInterval: (data: ImportPage[] | undefined): number => {
        const s = data?.[0]?.data[0]?.status;
        return s === "pending" || s === "queued" || s === "running" ? 3000 : 0;
      },
    },
  );

  const allImports = pages?.flatMap((p) => p.data) ?? [];
  const hasMore = Boolean(pages?.[pages.length - 1]?.nextCursor);
  const latestImport = allImports[0] ?? null;
  const canImport = canTriggerImport(project);
  const hasImports = allImports.length > 0;
  const isImporting = project.status === "importing";
  const latestImportFailed = latestImport?.status === "failed";
  const latestImportActive =
    latestImport?.status === "pending" ||
    latestImport?.status === "queued" ||
    latestImport?.status === "running" ||
    latestImport?.parseStatus === "queued" ||
    latestImport?.parseStatus === "running";

  // Fix #2: stats từ latest completed import
  const latestCompletedImport =
    allImports.find((imp) => imp.status === "completed") ?? null;
  const isReadyToExplore = latestCompletedImport?.parseStatus === "completed";
  const analysisStats = getProjectImportAnalysisStats(latestCompletedImport);
  const hasStats =
    latestCompletedImport !== null &&
    (analysisStats.totalFiles !== null ||
      analysisStats.sourceFiles !== null ||
      analysisStats.parsedFiles !== null ||
      analysisStats.dependenciesFound !== null);

  const importLabel = isImporting
    ? "Importing..."
    : isImportPending
      ? "Starting..."
      : latestImportFailed
        ? "Retry import"
        : hasImports
          ? "Re-import"
          : "Import project";

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isValidating) {
          void setSize((s) => s + 1);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isValidating, setSize]);

  async function revalidateProjectDetail() {
    await Promise.all([mutateProject(), mutateImports()]);
  }

  function handleImport() {
    if (!canImport) {
      toast({
        title: "Repository URL required",
        description: "Add a repository URL before starting an import.",
        variant: "destructive",
      });
      return;
    }

    startImportTransition(async () => {
      try {
        await triggerProjectImport(project.id, {
          branch: project.defaultBranch ?? undefined,
        });
        await revalidateProjectDetail();
        toast({ title: hasImports ? "Re-import started" : "Import started" });
      } catch (error) {
        toast({
          title: "Unable to start import",
          description:
            error instanceof ProjectsApiError
              ? error.message
              : "An unexpected error occurred.",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <ProjectStatusBadge status={project.status} />
            <ProjectVisibilityBadge visibility={project.visibility} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          {project.description ? (
            <p className="text-sm text-muted-foreground">{project.description}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleImport}
            disabled={isImportPending || isImporting || !canImport}
            size="sm"
          >
            <RefreshCcw className="size-3.5" />
            {importLabel}
          </Button>

          <Separator orientation="vertical" className="h-6" />

          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${project.id}/explorer`}>
              <Workflow className="size-3.5" />
              Explorer
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${project.id}/insights`}>
              <BarChart2 className="size-3.5" />
              Insights
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${project.id}/graph`}>
              <Network className="size-3.5" />
              Graph
            </Link>
          </Button>

          <Separator orientation="vertical" className="h-6" />

          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${project.id}/history`}>
              <History className="size-3.5" />
              History
            </Link>
          </Button>
          <EditProjectDialog
            project={project}
            onUpdated={revalidateProjectDetail}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="size-3.5" />
                Edit
              </Button>
            }
          />
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Fix #1: Onboarding banner khi chưa có import */}
      {!hasImports && !isImporting ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
              <BookOpen className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="font-medium">Get started with your first import</p>
                <p className="text-sm text-muted-foreground">
                  Import your repository to start exploring the codebase — file
                  structure, dependency graph, symbols, and insights will be
                  available once the import completes.
                </p>
              </div>
              {canImport ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={handleImport} disabled={isImportPending}>
                    <RefreshCcw className="size-3.5" />
                    Start first import
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    Add a repository URL first —
                  </p>
                  <EditProjectDialog
                    project={project}
                    onUpdated={revalidateProjectDetail}
                    trigger={
                      <Button variant="outline" size="sm">
                        <Pencil className="size-3.5" />
                        Edit project
                      </Button>
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {latestImportActive ? (
        <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-medium">Import in progress</p>
              <p className="text-sm text-muted-foreground">
                CodeMap is still importing or parsing this project. Explorer is
                safest after the latest import completes.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${project.id}/history`}>
                <History className="size-3.5" />
                View history
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {latestImportFailed ? (
        <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-medium text-destructive">Latest import failed</p>
              <p className="text-sm text-muted-foreground">
                Retry the import after checking repository access, branch, or
                the latest error in history.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={handleImport}
                disabled={isImportPending || isImporting || !canImport}
              >
                <RefreshCcw className="size-3.5" />
                Retry import
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/projects/${project.id}/history`}>
                  <History className="size-3.5" />
                  View history
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isReadyToExplore ? (
        <div className="rounded-lg border border-border/70 bg-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-medium">Index ready</p>
              <p className="text-sm text-muted-foreground">
                Open the indexed project in Explorer, Graph, or Insights.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <Link href={`/projects/${project.id}/explorer`}>
                  <Workflow className="size-3.5" />
                  Open Explorer
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/projects/${project.id}/graph`}>
                  <Network className="size-3.5" />
                  Open Graph
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/projects/${project.id}/insights`}>
                  <BarChart2 className="size-3.5" />
                  View Insights
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Fix #2: Stats cards khi có completed import */}
      {hasStats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={FileCode2}
            label="Total files"
            value={formatProjectImportAnalysisCount(analysisStats.totalFiles)}
          />
          <StatCard
            icon={FileCode2}
            label="Source files"
            value={formatProjectImportAnalysisCount(analysisStats.sourceFiles)}
          />
          <StatCard
            icon={BookOpen}
            label="Parsed files"
            value={formatProjectImportAnalysisCount(analysisStats.parsedFiles)}
          />
          <StatCard
            icon={Share2}
            label="Dependencies"
            value={formatProjectImportAnalysisCount(analysisStats.dependenciesFound)}
          />
        </div>
      ) : null}

      {/* Body */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* Import list */}
        <div className="rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
            <p className="text-sm font-medium">Imports</p>
            {allImports.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {allImports.length} loaded
              </span>
            ) : null}
          </div>

          {allImports.length === 0 && !isImporting ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              No imports yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {allImports.map((imp) => (
                <ImportRow key={imp.id} imp={imp} />
              ))}
            </ul>
          )}

          <div ref={sentinelRef} className="h-1" />

          {isValidating && size > 1 ? (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading more…
            </div>
          ) : null}

          {!hasMore && allImports.length > 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              All {allImports.length} imports loaded
            </p>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Latest import summary */}
          {latestImport ? (
            <div className="rounded-lg border border-border/70 bg-card p-5 space-y-3">
              <p className="text-sm font-medium">Latest import</p>
              <div className="flex flex-wrap items-center gap-2">
                <ProjectImportStatusBadge status={latestImport.status} />
                {latestImport.branch ? (
                  <Badge variant="secondary" className="font-mono text-xs">
                    {latestImport.branch}
                  </Badge>
                ) : null}
              </div>

              {/* Fix #4: parse status */}
              {latestImport.status === "completed" ? (
                <ParseStatusRow parseStatus={latestImport.parseStatus} />
              ) : null}

              <div className="space-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3" />
                  Started{" "}
                  <LocalProjectDate
                    value={latestImport.startedAt}
                    className="text-foreground"
                  />
                </span>
                {latestImport.completedAt ? (
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3" />
                    Finished{" "}
                    <LocalProjectDate
                      value={latestImport.completedAt}
                      className="text-foreground"
                    />
                    {/* Duration */}
                    <span className="text-muted-foreground">
                      ({formatDuration(latestImport.startedAt, latestImport.completedAt)})
                    </span>
                  </span>
                ) : null}
              </div>

              {latestImport.errorMessage ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <p>{latestImport.errorMessage}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Repository */}
          <div className="rounded-lg border border-border/70 bg-card p-5 space-y-4">
            <p className="text-sm font-medium">Repository</p>
            <dl className="space-y-2.5 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Source</dt>
                <dd className="mt-0.5 truncate">{getProjectRepositoryLabel(project)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Branch</dt>
                <dd className="mt-0.5 font-mono text-xs">
                  {project.defaultBranch || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last imported</dt>
                <dd className="mt-0.5">
                  <LocalProjectDate
                    value={project.lastImportedAt}
                    emptyLabel="Never"
                  />
                </dd>
              </div>
              {project.provider ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Provider</dt>
                  <dd className="mt-0.5 capitalize">
                    {project.provider.replace("_", " ")}
                  </dd>
                </div>
              ) : null}
            </dl>
            {project.repositoryUrl ? (
              <a
                href={project.repositoryUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="size-3" />
                Open repository
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <DeleteProjectDialog
        project={project}
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onDeleted={() => {
          router.push("/projects");
          router.refresh();
        }}
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-4 space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

const parseStatusStyles: Record<string, string> = {
  completed: "text-emerald-600 dark:text-emerald-400",
  partial: "text-amber-600 dark:text-amber-400",
  failed: "text-destructive",
  running: "text-blue-600 dark:text-blue-400",
  pending: "text-muted-foreground",
  queued: "text-muted-foreground",
};

function ParseStatusRow({ parseStatus }: { parseStatus: ProjectImportParseStatus }) {
  const label = getProjectImportParseStatusLabel(parseStatus);
  const colorClass = parseStatusStyles[parseStatus] ?? "text-muted-foreground";
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <BookOpen className="size-3 text-muted-foreground" />
      <span className="text-muted-foreground">Parse:</span>
      <span className={cn("font-medium", colorClass)}>{label}</span>
    </div>
  );
}

// Fix #3: ImportRow với parse status, duration, và indexed counts
function ImportRow({
  imp,
}: {
  imp: ProjectImport & { commitMessage?: string | null };
}) {
  const isActive =
    imp.status === "pending" || imp.status === "queued" || imp.status === "running";
  const duration =
    imp.completedAt ? formatDuration(imp.startedAt, imp.completedAt) : null;

  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <div className="mt-0.5 shrink-0">
        <ProjectImportStatusBadge status={imp.status} />
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {imp.branch ? (
            <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
              <GitBranch className="size-3" />
              {imp.branch}
            </span>
          ) : null}
          {imp.commitMessage ? (
            <span className="truncate text-xs text-foreground">{imp.commitMessage}</span>
          ) : null}
        </div>

        {/* Fix #4: parse status inline */}
        {imp.status === "completed" && imp.parseStatus ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Parse:</span>
            <span
              className={cn(
                "font-medium",
                parseStatusStyles[imp.parseStatus] ?? "text-muted-foreground",
              )}
            >
              {getProjectImportParseStatusLabel(imp.parseStatus)}
            </span>
            {/* Fix #3: indexed counts */}
            {imp.parseStatus === "completed" || imp.parseStatus === "partial" ? (
              <span className="text-muted-foreground">
                · {imp.indexedFileCount.toLocaleString()} files ·{" "}
                {imp.indexedSymbolCount.toLocaleString()} symbols
              </span>
            ) : null}
          </div>
        ) : null}

        {isActive ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            In progress…
          </div>
        ) : null}
      </div>

      <div className="shrink-0 text-right text-xs text-muted-foreground space-y-0.5">
        <LocalProjectDate value={imp.startedAt} />
        {duration ? (
          <p className="text-[10px] text-muted-foreground/60">{duration}</p>
        ) : null}
      </div>
    </li>
  );
}

function formatDuration(startedAt: string, completedAt: string): string {
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}
