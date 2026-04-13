"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowUpRight,
  ExternalLink,
  GitBranch,
  Pencil,
  RefreshCcw,
  Settings2,
  Trash2,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  browserProjectsApi,
  ProjectsApiError,
  triggerProjectImport,
  type Project,
  type ProjectImport,
} from "@/lib/api/projects";
import { ProjectStatusBadge } from "../shared/project-status-badge";
import { ProjectVisibilityBadge } from "../shared/project-visibility-badge";
import {
  getLatestProjectImport,
  getProjectImportStatusLabel,
  getProjectRepositoryLabel,
} from "../shared/project-helpers";
import { LocalProjectDate } from "../shared/local-project-date";
import { ProjectImportStatusBadge } from "../shared/project-import-status-badge";
import { DeleteProjectDialog } from "../list/delete-project-dialog";
import { EditProjectDialog } from "./edit-project-dialog";
import { ProjectImportHistory } from "./project-import-history";

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
  const swrOptions = {
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
      ...swrOptions,
      fallbackData: initialProject,
      refreshInterval: (currentProject?: Project) =>
        currentProject?.status === "importing" ? 3000 : 0,
    },
  );

  const { data: imports, mutate: mutateImports } = useSWR(
    ["project-imports", projectId],
    () => browserProjectsApi.getProjectImports(projectId),
    {
      ...swrOptions,
      fallbackData: initialImports,
      refreshInterval: (currentImports?: ProjectImport[]) => {
        const latestImport = currentImports?.[0];
        return latestImport?.status === "pending" ||
          latestImport?.status === "running"
          ? 3000
          : 0;
      },
    },
  );

  const latestImport = getLatestProjectImport(imports);
  const canImport = Boolean(project.repositoryUrl);
  const hasImports = imports.length > 0;
  const importActionLabel = project.status === "importing"
    ? "Importing..."
    : !canImport
      ? "Repository required"
      : isImportPending
        ? "Starting..."
        : hasImports
          ? "Re-import repository"
          : "Import repository";

  async function revalidateProjectDetail() {
    await Promise.all([mutateProject(), mutateImports()]);
  }

  function handleImport() {
    if (!canImport) {
      toast({
        title: "Repository URL required",
        description:
          "Add a repository URL before starting the first import for this project.",
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

        toast({
          title: hasImports ? "Re-import started" : "Import started",
          description: hasImports
            ? "We started a new repository import using the current project settings."
            : "We started the first repository import for this project.",
        });
      } catch (error) {
        toast({
          title: "Unable to start import",
          description:
            error instanceof ProjectsApiError
              ? error.message
              : "An unexpected error occurred. Please try again.",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={project.status} />
                <ProjectVisibilityBadge visibility={project.visibility} />
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {project.description || "No description has been added yet."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleImport}
                disabled={
                  isImportPending || project.status === "importing" || !canImport
                }
              >
                <RefreshCcw className="size-4" />
                {importActionLabel}
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/projects/${project.id}/map`}>
                  <Workflow className="size-4" />
                  Open mapping
                </Link>
              </Button>
              <EditProjectDialog
                project={project}
                onUpdated={revalidateProjectDetail}
                trigger={
                  <Button variant="outline">
                    <Pencil className="size-4" />
                    Edit project
                  </Button>
                }
              />
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-background/70 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Latest import
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {latestImport ? (
                      <>
                        <ProjectImportStatusBadge status={latestImport.status} />
                        {latestImport.branch ? (
                          <Badge variant="secondary">{latestImport.branch}</Badge>
                        ) : null}
                        {latestImport.sourceAvailable ? (
                          <Badge variant="secondary">Preview ready</Badge>
                        ) : null}
                      </>
                    ) : (
                      <Badge variant="outline">No imports yet</Badge>
                    )}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {latestImport ? (
                    <div className="space-y-1 text-right">
                      <p>
                        Started{" "}
                        <LocalProjectDate
                          value={latestImport.startedAt}
                          className="text-foreground"
                        />
                      </p>
                      <p>
                        {latestImport.completedAt ? "Finished" : "Last updated"}{" "}
                        <LocalProjectDate
                          value={latestImport.completedAt ?? latestImport.updatedAt}
                          className="text-foreground"
                        />
                      </p>
                    </div>
                  ) : (
                    <p>Run the first import to generate repository history.</p>
                  )}
                </div>
              </div>
              {latestImport?.errorMessage ? (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p>{latestImport.errorMessage}</p>
                </div>
              ) : null}
              {latestImport && !latestImport.errorMessage ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Latest import result: {getProjectImportStatusLabel(latestImport.status)}.
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-background/70 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Repository
              </p>
              <p className="mt-2 text-sm">{getProjectRepositoryLabel(project)}</p>
              {project.repositoryUrl ? (
                <a
                  href={project.repositoryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Open repository
                    <ArrowUpRight className="size-4" />
                  </a>
                ) : null}
              </div>

              <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Default branch
                </p>
                <p className="mt-2 text-sm">{project.defaultBranch || "Not set"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last imported{" "}
                  <LocalProjectDate
                    value={project.lastImportedAt}
                    emptyLabel="Never imported"
                  />
                </p>
              </div>

              <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Slug
                </p>
                <p className="mt-2 text-sm">{project.slug}</p>
              </div>

              <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Latest import status
                </p>
                <p className="mt-2 text-sm capitalize">
                  {latestImport?.status ?? "No imports yet"}
                </p>
                {latestImport?.completedAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Finished <LocalProjectDate value={latestImport.completedAt} />
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <ProjectImportHistory
          projectId={project.id}
          imports={imports}
          onImportChanged={revalidateProjectDetail}
        />
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full justify-start"
            onClick={handleImport}
            disabled={isImportPending || project.status === "importing" || !canImport}
          >
            <RefreshCcw className="size-4" />
            {canImport
              ? hasImports
                ? "Start a new re-import"
                : "Start the first import"
              : "Add repository metadata first"}
          </Button>
          <Button variant="outline" className="w-full justify-start" asChild>
            <Link href={`/projects/${project.id}/map`}>
              <Workflow className="size-4" />
              Open mapping workspace
            </Link>
          </Button>
          {project.repositoryUrl ? (
            <Button variant="outline" className="w-full justify-start" asChild>
              <a href={project.repositoryUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Open repository URL
              </a>
            </Button>
          ) : null}
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Imports are tracked immediately. Once a completed import exists, the
            mapping page will switch from the empty processing states into the
            placeholder explorer workspace.
          </div>
          <div className="rounded-lg border border-border/70 bg-background/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Project settings
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <EditProjectDialog
                project={project}
                onUpdated={revalidateProjectDetail}
                trigger={
                  <Button variant="outline" className="w-full justify-start">
                    <Settings2 className="size-4" />
                    Edit metadata
                  </Button>
                }
              />
              <Button
                variant="outline"
                className="w-full justify-start text-destructive hover:text-destructive"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="size-4" />
                Delete project
              </Button>
            </div>
          </div>
          {project.externalRepoId ? (
            <div className="rounded-lg border border-border/70 bg-background/70 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                External repository ID
              </p>
              <p className="mt-2 text-sm">{project.externalRepoId}</p>
            </div>
          ) : null}
          {project.provider ? (
            <div className="rounded-lg border border-border/70 bg-background/70 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Provider
              </p>
              <p className="mt-2 text-sm capitalize">
                <GitBranch className="mr-2 inline size-4" />
                {project.provider}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

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
