"use client";

import Link from "next/link";
import {
  MoreHorizontal,
  FolderKanban,
  Trash2,
  Pencil,
  ArrowUpRight,
  Building2,
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
import { Badge } from "@/components/ui/badge";
import type { AdminProject } from "@/features/admin/api";
import { ProjectImportStatusBadge } from "@/features/projects/components/project-import-status-badge";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";

function formatRepositoryUrl(url: string | null): string {
  if (!url) return "—";
  return url
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/^https:\/\/gitlab\.com\//, "")
    .replace(/\.git$/, "");
}

function ProviderBadge({ provider }: { provider: string | null }) {
  if (!provider) return <Badge variant="outline">local</Badge>;

  const icons: Record<string, string> = {
    github: "🐙",
    gitlab: "🦊",
    local_workspace: "💻",
  };

  return (
    <Badge variant="outline" className="gap-1">
      {icons[provider] ?? "📁"} {provider.replace("_", " ")}
    </Badge>
  );
}

export function AdminProjectCard({
  project,
  workspaceName,
  onDelete,
  onEdit,
}: {
  project: AdminProject;
  workspaceName?: string;
  onDelete: (project: AdminProject) => void;
  onEdit: (project: AdminProject) => void;
}) {
  const latestImport = project.latestImport;

  return (
    <Card className="border-border/80 glass-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {project.name}
            </h2>
            <ProjectStatusBadge status={project.status as "draft" | "importing" | "ready" | "failed" | "archived"} />
            <ProviderBadge provider={project.provider} />
            {workspaceName && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="size-3" />
                {workspaceName}
              </span>
            )}
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">
            {project.description || "No description."}
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
              <Link href={`/admin/projects/${project.id}`}>
                <FolderKanban className="size-4" />
                View details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEdit(project)}>
              <Pencil className="size-4" />
              Edit project
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDelete(project)}
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
          <p className="mt-1 text-sm">
            {formatRepositoryUrl(project.repositoryUrl)}
          </p>
        </div>
        <div className="rounded-md border border-border/70 bg-background/70 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Default branch
          </p>
          <p className="mt-1 text-sm">{project.defaultBranch || "Not set"}</p>
        </div>
        <div className="rounded-md border border-border/70 bg-background/70 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Last import
          </p>
          <div className="mt-2">
            {latestImport ? (
              <ProjectImportStatusBadge status={latestImport.status} />
            ) : (
              <p className="text-sm text-muted-foreground">No imports</p>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {latestImport
              ? `${latestImport.indexedFileCount} files · ${latestImport.indexedSymbolCount} symbols`
              : "Never imported"}
          </p>
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href={`/admin/projects/${project.id}`}>
            <FolderKanban className="size-4" />
            View details
          </Link>
        </Button>
        {project.repositoryUrl && (
          <Button variant="ghost" asChild className="ml-auto">
            <a href={project.repositoryUrl} target="_blank" rel="noreferrer">
              Repo
              <ArrowUpRight className="size-4" />
            </a>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
