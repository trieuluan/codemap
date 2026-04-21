"use client";

import { useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
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
import type { ProjectListItem, ProjectStatus } from "@/features/projects/api";
import { CreateProjectDialog } from "./components/create-project-dialog";
import { DeleteProjectDialog } from "./components/delete-project-dialog";
import { ProjectListCard } from "./components/project-list-card";

const statusOptions: Array<{ label: string; value: ProjectStatus | "all" }> = [
  { label: "All statuses", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Importing", value: "importing" },
  { label: "Ready", value: "ready" },
  { label: "Failed", value: "failed" },
  { label: "Archived", value: "archived" },
];

export function ProjectList({
  initialProjects,
}: {
  initialProjects: ProjectListItem[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
  const [projectToDelete, setProjectToDelete] = useState<ProjectListItem | null>(
    null,
  );

  const filteredProjects = projects.filter((project) => {
    const matchesQuery =
      !query.trim() ||
      project.name.toLowerCase().includes(query.toLowerCase()) ||
      project.description?.toLowerCase().includes(query.toLowerCase()) ||
      project.slug.toLowerCase().includes(query.toLowerCase());

    const matchesStatus = status === "all" || project.status === status;

    return matchesQuery && matchesStatus;
  });

  const hasProjects = projects.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Create, import, and explore the codebases you want CodeMap to map.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
            className="w-full sm:w-72"
          />
          <Select
            value={status}
            onValueChange={(value: string) =>
              setStatus(value as ProjectStatus | "all")
            }
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CreateProjectDialog
            trigger={
              <Button>
                <Plus className="size-4" />
                New Project
              </Button>
            }
          />
        </div>
      </div>

      {!hasProjects ? (
        <Empty className="border border-dashed border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderKanban className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Start by creating a project with its repository URL and default
              branch so the first import can be triggered right away.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CreateProjectDialog
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
              Try a different search or status filter.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
            >
              Reset filters
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredProjects.map((project) => (
            <ProjectListCard
              key={project.id}
              project={project}
              onDelete={setProjectToDelete}
            />
          ))}
        </div>
      )}

      <DeleteProjectDialog
        project={projectToDelete}
        open={!!projectToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setProjectToDelete(null);
          }
        }}
        onDeleted={(projectId) => {
          setProjects((current) => current.filter((project) => project.id !== projectId));
        }}
      />
    </div>
  );
}
