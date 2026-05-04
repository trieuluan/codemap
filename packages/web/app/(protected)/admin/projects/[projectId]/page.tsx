import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  ArrowLeft,
  GitBranch,
  FolderKanban,
  Hash,
  Clock,
  Building2,
  ExternalLink,
  RefreshCw,
  Pencil,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getAdminProject, listAdminWorkspaces } from "@/features/admin/api";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import { ProjectImportStatusBadge } from "@/features/projects/components/project-import-status-badge";
import { AdminImportHistory } from "@/features/admin/components/admin-import-history";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortSha(value: string | null) {
  return value ? value.slice(0, 7) : "—";
}

function formatRepositoryUrl(url: string | null): string {
  if (!url) return "—";
  return url
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/^https:\/\/gitlab\.com\//, "")
    .replace(/\.git$/, "");
}

function formatNumber(value: number) {
  return value.toLocaleString();
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

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const cookieHeader = (await cookies()).toString();

  let project;
  try {
    project = await getAdminProject(projectId, cookieHeader);
  } catch {
    notFound();
  }

  const workspaces = await listAdminWorkspaces(cookieHeader);
  const workspace = workspaces.find((w) => w.id === project.workspaceId);

  const latestImport = project.latestImport;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/admin/projects">
              <ArrowLeft className="mr-2 size-4" />
              Projects
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <ProjectStatusBadge status={project.status as "draft" | "importing" | "ready" | "failed" | "archived"} />
            <ProviderBadge provider={project.provider} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.description || "No description."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {project.repositoryUrl && (
            <Button asChild variant="outline" size="sm">
              <a
                href={project.repositoryUrl}
                target="_blank"
                rel="noreferrer"
              >
                View repository
                <ExternalLink className="ml-1 size-3" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="gap-3 py-4">
          <CardContent className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Workspace
              </p>
              <p className="mt-2 truncate text-lg font-semibold">
                {workspace?.name ?? "Unknown"}
              </p>
              <p className="text-xs text-muted-foreground">
                {project.slug}
              </p>
            </div>
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <Building2 className="size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardContent className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Repository
              </p>
              <p className="mt-2 truncate text-sm font-medium">
                {formatRepositoryUrl(project.repositoryUrl)}
              </p>
              <p className="text-xs text-muted-foreground">
                {project.defaultBranch || "No branch"}
              </p>
            </div>
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <FolderKanban className="size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardContent className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Latest Import
              </p>
              <p className="mt-2 text-lg font-semibold">
                {latestImport
                  ? <ProjectImportStatusBadge status={latestImport.status} />
                  : <span className="text-muted-foreground">None</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {latestImport?.completedAt
                  ? formatDate(latestImport.completedAt)
                  : "No imports"}
              </p>
            </div>
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <GitBranch className="size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardContent className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Created
              </p>
              <p className="mt-2 text-lg font-semibold">
                {formatDate(project.createdAt)}
              </p>
              <p className="text-xs text-muted-foreground">
                Updated {formatDate(project.updatedAt)}
              </p>
            </div>
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <Clock className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Import Stats */}
      {latestImport && (
        <Card>
          <CardHeader>
            <CardTitle>Latest Import Stats</CardTitle>
            <CardDescription>
              Indexing results from the most recent import.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-border/70 p-4">
              <Hash className="mb-3 size-4 text-muted-foreground" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Files
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(latestImport.indexedFileCount)}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 p-4">
              <Hash className="mb-3 size-4 text-muted-foreground" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Symbols
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(latestImport.indexedSymbolCount)}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 p-4">
              <Hash className="mb-3 size-4 text-muted-foreground" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Dependencies
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(latestImport.indexedEdgeCount)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import History - SWR Infinite Scroll */}
      <AdminImportHistory projectId={projectId} />

      {/* Project Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
          <CardDescription>
            Internal identifiers and configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-lg border border-border/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Project ID
            </p>
            <p className="mt-1 font-mono text-xs">{project.id}</p>
          </div>
          <div className="rounded-lg border border-border/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Owner User ID
            </p>
            <p className="mt-1 font-mono text-xs">{project.ownerUserId}</p>
          </div>
          <div className="rounded-lg border border-border/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Workspace ID
            </p>
            <p className="mt-1 font-mono text-xs">{project.workspaceId}</p>
          </div>
          <div className="rounded-lg border border-border/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              External Repo ID
            </p>
            <p className="mt-1 font-mono text-xs">
              {project.externalRepoId || "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Visibility
            </p>
            <p className="mt-1 capitalize">{project.visibility}</p>
          </div>
          <div className="rounded-lg border border-border/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Local Workspace Path
            </p>
            <p className="mt-1 font-mono text-xs">
              {project.localWorkspacePath || "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Destructive actions that cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 p-4">
            <div>
              <p className="text-sm font-medium">Trigger Reimport</p>
              <p className="text-xs text-muted-foreground">
                Re-index the project from the latest commit.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/w/${project.workspaceId}/projects/${project.id}`}>
                <RefreshCw className="mr-2 size-4" />
                Go to project to reimport
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
