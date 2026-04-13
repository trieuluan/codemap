"use client";

import Link from "next/link";
import {
  MoreHorizontal,
  GitBranch,
  FolderKanban,
  Trash2,
  ArrowUpRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectListItem } from "@/lib/api/projects";
import { ProjectImportStatusBadge } from "../shared/project-import-status-badge";
import { ProjectStatusBadge } from "../shared/project-status-badge";
import { getProjectRepositoryLabel } from "../shared/project-helpers";
import { LocalProjectDate } from "../shared/local-project-date";

export function ProjectListCard({
  project,
  onDelete,
}: {
  project: ProjectListItem;
  onDelete: (project: ProjectListItem) => void;
}) {
  const latestImport = project.latestImport ?? null;

  return (
    <Card className="border-border/80 bg-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {project.name}
            </h2>
            <ProjectStatusBadge status={project.status} />
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">
            {project.description || "No description added yet."}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0">
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Project actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/projects/${project.id}`}>Open project</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/projects/${project.id}/map`}>Open mapping</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(event: Event) => {
                event.preventDefault();
                onDelete(project);
              }}
            >
              <Trash2 className="size-4" />
              Delete project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border/70 bg-background/70 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Repository
          </p>
          <p className="mt-1 text-sm">{getProjectRepositoryLabel(project)}</p>
        </div>
        <div className="rounded-md border border-border/70 bg-background/70 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Default branch
          </p>
          <p className="mt-1 text-sm">{project.defaultBranch || "Not set"}</p>
        </div>
        <div className="rounded-md border border-border/70 bg-background/70 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Last imported
          </p>
          <div className="mt-2">
            {latestImport ? (
              <ProjectImportStatusBadge status={latestImport.status} />
            ) : (
              <p className="text-sm text-muted-foreground">No imports yet</p>
            )}
          </div>
          <p className="mt-1 text-sm">
            <LocalProjectDate
              value={project.lastImportedAt}
              emptyLabel="Never imported"
            />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {latestImport?.branch
              ? `Branch ${latestImport.branch}`
              : "No branch"}
          </p>
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href={`/projects/${project.id}`}>
            <FolderKanban className="size-4" />
            Open project
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/projects/${project.id}/map`}>
            <GitBranch className="size-4" />
            Open mapping
          </Link>
        </Button>
        {project.repositoryUrl ? (
          <Button variant="ghost" asChild className="ml-auto">
            <a href={project.repositoryUrl} target="_blank" rel="noreferrer">
              Repository
              <ArrowUpRight className="size-4" />
            </a>
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
