"use client";

import { useState, useTransition } from "react";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import type { AdminProject } from "@/features/admin/api";
import { AdminProjectCard } from "@/features/admin/components/admin-project-card";
import { CreateAdminProjectDialog } from "@/features/admin/components/create-admin-project-dialog";
import { EditAdminProjectDialog } from "@/features/admin/components/edit-admin-project-dialog";
import { DeleteAdminProjectDialog } from "@/features/admin/components/delete-admin-project-dialog";

type ProjectStatus = "draft" | "importing" | "ready" | "failed" | "archived";

const statusOptions: Array<{ label: string; value: ProjectStatus | "all" }> = [
  { label: "All statuses", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Importing", value: "importing" },
  { label: "Ready", value: "ready" },
  { label: "Failed", value: "failed" },
  { label: "Archived", value: "archived" },
];

const providerOptions: Array<{ label: string; value: string | "all" }> = [
  { label: "All providers", value: "all" },
  { label: "GitHub", value: "github" },
  { label: "GitLab", value: "gitlab" },
  { label: "Local workspace", value: "local_workspace" },
];

interface AdminWorkspaceOption {
  id: string;
  name: string;
  slug: string;
}

export function AdminProjectsView({
  initialProjects,
  initialWorkspaces,
}: {
  initialProjects: AdminProject[];
  initialWorkspaces: AdminWorkspaceOption[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [providerFilter, setProviderFilter] = useState<string | "all">("all");
  const [workspaceFilter, setWorkspaceFilter] = useState<string | "all">("all");
  const [showNoImport, setShowNoImport] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<AdminProject | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<AdminProject | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filteredProjects = projects.filter((project) => {
    const matchesQuery =
      !query.trim() ||
      project.name.toLowerCase().includes(query.toLowerCase()) ||
      project.description?.toLowerCase().includes(query.toLowerCase()) ||
      project.slug.toLowerCase().includes(query.toLowerCase()) ||
      (project.repositoryUrl?.toLowerCase().includes(query.toLowerCase()) ?? false);

    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    const matchesProvider = providerFilter === "all" || project.provider === providerFilter;
    const matchesWorkspace = workspaceFilter === "all" || project.workspaceId === workspaceFilter;
    const matchesNoImport = !showNoImport || !project.latestImport;

    return matchesQuery && matchesStatus && matchesProvider && matchesWorkspace && matchesNoImport;
  });

  const workspaceMap = Object.fromEntries(
    initialWorkspaces.map((w) => [w.id, w.name]),
  );

  function refreshProjects() {
    // In a real app, we'd refetch. For now, the mutations handle optimistic updates.
  }

  function handleProjectDeleted(projectId: string) {
    setProjects((current) => current.filter((p) => p.id !== projectId));
    refreshProjects();
  }

  function handleProjectUpdated(updated: AdminProject) {
    setProjects((current) =>
      current.map((p) => (p.id === updated.id ? updated : p)),
    );
    refreshProjects();
  }

  const activeFilterCount = [
    statusFilter !== "all",
    providerFilter !== "all",
    workspaceFilter !== "all",
    showNoImport,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Manage all projects across workspaces. {projects.length} project{projects.length !== 1 ? "s" : ""} total.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects..."
              className="pl-8"
            />
          </div>

          <Select
            value={statusFilter}
            onValueChange={(v: string) => setStatusFilter(v as ProjectStatus | "all")}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Sheet open={showFilters} onOpenChange={setShowFilters}>
            <SheetTrigger asChild>
              <Button variant="outline" className="relative">
                <SlidersHorizontal className="size-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>Filter projects</SheetTitle>
                <SheetDescription>
                  Narrow down the project list by provider, workspace, and more.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 py-6">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Provider</p>
                  <Select
                    value={providerFilter}
                    onValueChange={(v: string) => setProviderFilter(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All providers" />
                    </SelectTrigger>
                    <SelectContent>
                      {providerOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium">Workspace</p>
                  <Select
                    value={workspaceFilter}
                    onValueChange={(v: string) => setWorkspaceFilter(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All workspaces" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All workspaces</SelectItem>
                      {initialWorkspaces.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="no-import"
                    checked={showNoImport}
                    onCheckedChange={(v: boolean | "indeterminate") => setShowNoImport(Boolean(v))}
                  />
                  <label
                    htmlFor="no-import"
                    className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    No imports yet
                  </label>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setProviderFilter("all");
                    setWorkspaceFilter("all");
                    setShowNoImport(false);
                  }}
                >
                  Reset filters
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <CreateAdminProjectDialog
            workspaces={initialWorkspaces}
            onCreated={(project) => {
              setProjects((current) => [project, ...current]);
            }}
            trigger={
              <Button>
                <Plus className="size-4" />
                New Project
              </Button>
            }
          />
        </div>
      </div>

      {projects.length === 0 ? (
        <Empty className="border border-dashed border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Create your first project to start mapping codebases.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CreateAdminProjectDialog
              workspaces={initialWorkspaces}
              onCreated={(project) => {
                setProjects((current) => [project, ...current]);
              }}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Create your first project
                </Button>
              }
            />
          </EmptyContent>
        </Empty>
      ) : filteredProjects.length === 0 ? (
        <Empty className="border border-dashed border-border bg-card">
          <EmptyHeader>
            <EmptyTitle>No projects match your filters</EmptyTitle>
            <EmptyDescription>
              Try adjusting your search query or clearing some filters.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setProviderFilter("all");
                setWorkspaceFilter("all");
                setShowNoImport(false);
              }}
            >
              Reset all filters
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredProjects.map((project) => (
            <AdminProjectCard
              key={project.id}
              project={project}
              workspaceName={workspaceMap[project.workspaceId]}
              onDelete={setProjectToDelete}
              onEdit={setProjectToEdit}
            />
          ))}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Showing {filteredProjects.length} of {projects.length} projects
      </p>

      <EditAdminProjectDialog
        project={projectToEdit}
        workspaces={initialWorkspaces}
        open={!!projectToEdit}
        onOpenChange={(open) => {
          if (!open) setProjectToEdit(null);
        }}
        onUpdated={handleProjectUpdated}
      />

      <DeleteAdminProjectDialog
        project={projectToDelete}
        open={!!projectToDelete}
        onOpenChange={(open) => {
          if (!open) setProjectToDelete(null);
        }}
        onDeleted={handleProjectDeleted}
      />
    </div>
  );
}
