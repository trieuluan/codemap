"use client";

import Link from "next/link";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BarChart2,
  Clock,
  ExternalLink,
  History,
  Loader2,
  Network,
  Pencil,
  RefreshCcw,
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
} from "@/features/projects/api";
import { ProjectStatusBadge } from "../components/project-status-badge";
import { ProjectVisibilityBadge } from "../components/project-visibility-badge";
import { getProjectRepositoryLabel } from "../utils/project-helpers";
import { LocalProjectDate } from "../components/local-project-date";
import { ProjectImportStatusBadge } from "../components/project-import-status-badge";
import { DeleteProjectDialog } from "../list/components/delete-project-dialog";
import { EditProjectDialog } from "./components/edit-project-dialog";

const PAGE_SIZE = 20;

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

  // SWR Infinite — cursor-based pagination
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
        const latestStatus = data?.[0]?.data[0]?.status;
        return latestStatus === "pending" ||
          latestStatus === "queued" ||
          latestStatus === "running"
          ? 3000
          : 0;
      },
    },
  );

  const allImports = pages?.flatMap((p) => p.data) ?? [];
  const hasMore = Boolean(pages?.[pages.length - 1]?.nextCursor);
  const latestImport = allImports[0] ?? null;
  const canImport = Boolean(project.repositoryUrl);
  const hasImports = allImports.length > 0;
  const isImporting = project.status === "importing";

  const importLabel = isImporting
    ? "Importing..."
    : isImportPending
      ? "Starting..."
      : hasImports
        ? "Re-import"
        : "Import";

  // Intersection observer — load next page when sentinel is visible
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

      {/* Body */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* Import list */}
        <div className="rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
            <p className="text-sm font-medium">Imports</p>
            <span className="text-xs text-muted-foreground">
              {allImports.length} loaded
            </span>
          </div>

          {allImports.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              No imports yet. Run the first import to start indexing this repository.
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {allImports.map((imp) => (
                <ImportRow key={imp.id} imp={imp} />
              ))}
            </ul>
          )}

          {/* Infinity scroll sentinel */}
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

        {/* Metadata */}
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
              <div className="space-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3" />
                  Started{" "}
                  <LocalProjectDate value={latestImport.startedAt} className="text-foreground" />
                </span>
                {latestImport.completedAt ? (
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3" />
                    Finished{" "}
                    <LocalProjectDate value={latestImport.completedAt} className="text-foreground" />
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
                <dd className="mt-0.5 font-mono text-xs">{project.defaultBranch || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last imported</dt>
                <dd className="mt-0.5">
                  <LocalProjectDate value={project.lastImportedAt} emptyLabel="Never" />
                </dd>
              </div>
              {project.provider ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Provider</dt>
                  <dd className="mt-0.5 capitalize">{project.provider.replace("_", " ")}</dd>
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

function ImportRow({ imp }: { imp: ProjectImport & { commitMessage?: string | null } }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <ProjectImportStatusBadge status={imp.status} />
      <div className="min-w-0 flex-1">
        {imp.branch ? (
          <span className="font-mono text-xs text-muted-foreground">{imp.branch}</span>
        ) : null}
        {imp.commitMessage ? (
          <p className="truncate text-sm">{imp.commitMessage}</p>
        ) : null}
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <LocalProjectDate value={imp.startedAt} />
      </div>
    </li>
  );
}
