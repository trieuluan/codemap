"use client";

import { Card } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { Project, ProjectImport } from "@/lib/api/projects";
import { formatProjectDate } from "../shared/project-helpers";

interface ImportProgressProps {
  project: Project;
  latestImport: ProjectImport | null;
}

export function ImportProgress({
  project,
  latestImport,
}: ImportProgressProps) {
  const steps = [
    {
      label: "Import queued",
      status:
        latestImport?.status === "pending" ||
        latestImport?.status === "running" ||
        latestImport?.status === "completed"
          ? "complete"
          : "pending",
      details: latestImport?.startedAt
        ? `Queued ${formatProjectDate(latestImport.startedAt)}`
        : undefined,
    },
    {
      label: "Repository import",
      status:
        latestImport?.status === "running"
          ? "loading"
        : latestImport?.status === "completed"
            ? "complete"
            : "pending",
      details: latestImport?.branch
        ? `${project.name} · ${latestImport.branch}`
        : project.name,
    },
    {
      label: "Project mapping",
      status: latestImport?.status === "completed" ? "complete" : "pending",
      details:
        latestImport?.status === "completed"
          ? `Finished ${formatProjectDate(
              latestImport.completedAt || latestImport.updatedAt,
            )}`
          : "Waiting for a completed import before map generation.",
    },
  ] as const;

  return (
    <Card className="border-border/70 bg-card p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {project.status === "importing" ? "Importing repository" : "Import status"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.repositoryUrl || "Repository metadata will appear here once connected."}
          </p>
        </div>

        <div className="space-y-3">
          {steps.map((step) => (
            <div key={step.label} className="flex items-start gap-3">
              <div className="mt-1 shrink-0">
                {step.status === "complete" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : step.status === "loading" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-sidebar-accent" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{step.label}</p>
                {step.details ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {step.details}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {latestImport?.errorMessage ? (
          <p className="text-sm text-destructive">{latestImport.errorMessage}</p>
        ) : null}
      </div>
    </Card>
  );
}
