"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowUpRight, GitBranch, Pencil, RefreshCcw, Workflow } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  ProjectsApiError,
  triggerProjectImport,
  type Project,
  type ProjectImport,
} from "@/lib/api/projects";
import { ProjectStatusBadge } from "../shared/project-status-badge";
import { ProjectVisibilityBadge } from "../shared/project-visibility-badge";
import {
  formatLastImportedAt,
  getLatestProjectImport,
  getProjectRepositoryLabel,
} from "../shared/project-helpers";
import { EditProjectDialog } from "./edit-project-dialog";
import { ProjectImportHistory } from "./project-import-history";

export function ProjectOverview({
  project,
  imports,
}: {
  project: Project;
  imports: ProjectImport[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isImportPending, startImportTransition] = useTransition();
  const latestImport = getLatestProjectImport(imports);

  function handleImport() {
    startImportTransition(async () => {
      try {
        await triggerProjectImport(project.id, {
          branch: project.defaultBranch ?? undefined,
        });

        toast({
          title: "Import started",
          description: "We started a new repository import for this project.",
        });
        router.refresh();
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
                disabled={isImportPending || project.status === "importing"}
              >
                <RefreshCcw className="size-4" />
                {project.status === "importing"
                  ? "Importing..."
                  : isImportPending
                    ? "Starting..."
                    : "Import repository"}
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/projects/${project.id}/map`}>
                  <Workflow className="size-4" />
                  Open mapping
                </Link>
              </Button>
              <EditProjectDialog
                project={project}
                onUpdated={() => router.refresh()}
                trigger={
                  <Button variant="outline">
                    <Pencil className="size-4" />
                    Edit project
                  </Button>
                }
              />
            </div>
          </CardHeader>

          <CardContent className="grid gap-4 md:grid-cols-2">
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
                Last imported {formatLastImportedAt(project.lastImportedAt)}
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
                {latestImport?.status || "No imports yet"}
              </p>
              {latestImport?.errorMessage ? (
                <p className="mt-1 text-xs text-destructive">
                  {latestImport.errorMessage}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <ProjectImportHistory imports={imports} />
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full justify-start" onClick={handleImport}>
            <RefreshCcw className="size-4" />
            Start a new import
          </Button>
          <Button variant="outline" className="w-full justify-start" asChild>
            <Link href={`/projects/${project.id}/map`}>
              <Workflow className="size-4" />
              Open mapping workspace
            </Link>
          </Button>
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Imports are tracked immediately, but the code structure explorer on
            the mapping page is still mock data for this iteration.
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
    </div>
  );
}
