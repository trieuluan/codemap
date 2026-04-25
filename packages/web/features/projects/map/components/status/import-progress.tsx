"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { Project, ProjectImport } from "@/features/projects/api";
import { cn } from "@/lib/utils";
import {
  formatProjectImportAnalysisCount,
  getProjectImportAnalysisStats,
  getProjectImportStatusLabel,
  getProjectImportParseStatusLabel,
} from "../../../utils/project-helpers";
import { LocalProjectDate } from "../../../components/local-project-date";

function statusBadgeClassName(status?: ProjectImport["status"]) {
  switch (status) {
    case "pending":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700";
    case "queued":
      return "border-sky-500/20 bg-sky-500/10 text-sky-700";
    case "running":
      return "border-blue-500/20 bg-blue-500/10 text-blue-700";
    case "completed":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
    case "failed":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    default:
      return "border-border/70 bg-muted/40 text-muted-foreground";
  }
}

function parseStatusBadgeClassName(status?: ProjectImport["parseStatus"]) {
  switch (status) {
    case "pending":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700";
    case "queued":
      return "border-sky-500/20 bg-sky-500/10 text-sky-700";
    case "running":
      return "border-blue-500/20 bg-blue-500/10 text-blue-700";
    case "completed":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
    case "partial":
      return "border-orange-500/20 bg-orange-500/10 text-orange-700";
    case "failed":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    default:
      return "border-border/70 bg-muted/40 text-muted-foreground";
  }
}

interface ImportProgressProps {
  project: Project;
  latestImport: ProjectImport | null;
}

export function ImportProgress({
  project,
  latestImport,
}: ImportProgressProps) {
  const stats = getProjectImportAnalysisStats(latestImport);
  const parseStatusLabel = getProjectImportParseStatusLabel(
    latestImport?.parseStatus,
  );
  const isImportComplete = latestImport?.status === "completed";
  const isImportQueued = latestImport?.status === "queued";
  const isImportRunning = latestImport?.status === "running";
  const isParseQueued = latestImport?.parseStatus === "queued";
  const isParseRunning = latestImport?.parseStatus === "running";
  const isParseComplete = latestImport?.parseStatus === "completed";
  const isParsePartial = latestImport?.parseStatus === "partial";
  const isMapReady = isImportComplete && (isParseComplete || isParsePartial);

  const steps = [
    {
      label: "Import queued",
      status:
        latestImport?.status === "pending" ||
        latestImport?.status === "queued" ||
        latestImport?.status === "running" ||
        latestImport?.status === "completed"
          ? "complete"
          : "pending",
      details: latestImport?.startedAt
        ? (
            <>
              Queued <LocalProjectDate value={latestImport.startedAt} />
            </>
          )
        : undefined,
    },
    {
      label: "Repository import",
      status: isImportRunning
        ? "loading"
        : isImportComplete
          ? "complete"
          : isImportQueued
            ? "loading"
            : "pending",
      details: latestImport?.branch
        ? `${project.name} · ${latestImport.branch}`
        : project.name,
    },
    {
      label: "Semantic analysis",
      status:
        isParseQueued || isParseRunning
          ? "loading"
          : isParseComplete || isParsePartial
            ? "complete"
            : "pending",
      details:
        latestImport?.parseStartedAt || latestImport?.parseCompletedAt
          ? (
            <>
              {latestImport?.parseTool
                ? `${latestImport.parseTool}${latestImport.parseToolVersion ? ` v${latestImport.parseToolVersion}` : ""} · `
                : ""}
              {parseStatusLabel}{" "}
              <LocalProjectDate
                value={
                  latestImport?.parseCompletedAt ||
                  latestImport?.parseStartedAt ||
                  latestImport?.updatedAt
                }
              />
            </>
          )
          : `${parseStatusLabel} · ${formatProjectImportAnalysisCount(stats.parsedFiles)} / ${formatProjectImportAnalysisCount(stats.sourceFiles)} parsed`,
    },
    {
      label: "Project map ready",
      status: isMapReady ? "complete" : "pending",
      details: isMapReady
        ? (
            <>
              Ready{" "}
              <LocalProjectDate
                value={
                  latestImport?.parseCompletedAt ||
                  latestImport?.completedAt ||
                  latestImport?.updatedAt
                }
              />
            </>
          )
        : "Waiting for semantic analysis to produce a fresh project map.",
    },
  ] as const;

  return (
    <Card className="border-border/70 bg-card p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {project.status === "importing" || isParseQueued || isParseRunning
              ? "Analyzing repository"
              : "Import status"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.repositoryUrl || "Repository metadata will appear here once connected."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={cn("capitalize", statusBadgeClassName(latestImport?.status))}
            >
              {getProjectImportStatusLabel(latestImport?.status ?? "pending")}
            </Badge>
            <Badge
              variant="outline"
              className={cn(parseStatusBadgeClassName(latestImport?.parseStatus))}
            >
              {parseStatusLabel}
            </Badge>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Total files",
              value: formatProjectImportAnalysisCount(stats.totalFiles),
            },
            {
              label: "Source files",
              value: formatProjectImportAnalysisCount(stats.sourceFiles),
            },
            {
              label: "Parsed files",
              value: formatProjectImportAnalysisCount(stats.parsedFiles),
            },
            {
              label: "Dependencies found",
              value: formatProjectImportAnalysisCount(stats.dependenciesFound),
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3"
            >
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {item.value}
              </p>
            </div>
          ))}
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

        {latestImport?.parseError || latestImport?.errorMessage ? (
          <p className="text-sm text-destructive">
            {latestImport.parseError || latestImport.errorMessage}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
