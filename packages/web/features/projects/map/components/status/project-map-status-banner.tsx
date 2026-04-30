import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type {
  Project,
  ProjectImport,
  ProjectMapSnapshot,
} from "@/features/projects/api";
import { cn } from "@/lib/utils";
import {
  formatProjectImportAnalysisCount,
  getLatestProjectImport,
  getProjectImportAnalysisStats,
  getProjectImportParseStatusLabel,
  getProjectImportStatusLabel,
} from "../../../utils/project-helpers";
import { ImportProgress } from "./import-progress";

function statusBadgeClassName(status: ProjectImport["status"]) {
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
      return "";
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

function ImportAnalysisSummary({
  latestImport,
}: {
  latestImport: ProjectImport;
}) {
  const stats = getProjectImportAnalysisStats(latestImport);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
        {
          label: "Symbols",
          value: formatProjectImportAnalysisCount(stats.symbols),
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
  );
}

export function ProjectMapStatusBanner({
  project,
  imports,
  mapSnapshot,
}: {
  project: Project;
  imports: ProjectImport[];
  mapSnapshot: ProjectMapSnapshot | null;
}) {
  const latestImport = getLatestProjectImport(imports);
  const hasCompletedImport = imports.some(
    (item) => item.status === "completed",
  );
  const hasPreviewableSource = imports.some(
    (item) => item.status === "completed" && item.sourceAvailable,
  );

  if (
    project.status === "importing" ||
    latestImport?.status === "queued" ||
    latestImport?.status === "running" ||
    latestImport?.status === "pending"
  ) {
    return <ImportProgress project={project} latestImport={latestImport} />;
  }

  if (latestImport?.status === "failed" || project.status === "failed") {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Latest import failed</AlertTitle>
        <AlertDescription>
          <div className="space-y-3">
            <p>
              {latestImport?.parseError ||
                latestImport?.errorMessage ||
                "The latest import did not complete successfully."}
            </p>
            {latestImport ? (
              <ImportAnalysisSummary latestImport={latestImport} />
            ) : null}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (!hasCompletedImport) {
    return (
      <Alert>
        <Info />
        <AlertTitle>No code map available yet</AlertTitle>
        <AlertDescription>
          Run an import to generate the first project map. Until then, this
          workspace will stay in an empty placeholder state.
        </AlertDescription>
      </Alert>
    );
  }

  if (!hasPreviewableSource) {
    return (
      <Alert>
        <Info />
        <AlertTitle>Repository preview needs a fresh import</AlertTitle>
        <AlertDescription>
          This project has a completed map snapshot, but retained source is not
          available for file preview. Start a new import to enable file content
          browsing in this workspace.
        </AlertDescription>
      </Alert>
    );
  }

  if (!latestImport) {
    return null;
  }

  return (
    <Alert>
      <CheckCircle2 />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        Analysis ready
        <Badge
          variant="outline"
          className={cn(
            "capitalize",
            statusBadgeClassName(latestImport.status),
          )}
        >
          {getProjectImportStatusLabel(latestImport.status)}
        </Badge>
        <Badge
          variant="outline"
          className={cn(parseStatusBadgeClassName(latestImport.parseStatus))}
        >
          {getProjectImportParseStatusLabel(latestImport.parseStatus)}
        </Badge>
      </AlertTitle>
      <AlertDescription>
        <div className="space-y-3">
          <p>
            {latestImport.parseStatus === "partial"
              ? "Semantic analysis completed partially. The current map may be incomplete."
              : mapSnapshot
                ? "The latest semantic stats are available and the current map snapshot is ready to explore."
                : "The latest semantic stats are available for this project."}
          </p>
          <ImportAnalysisSummary latestImport={latestImport} />
        </div>
      </AlertDescription>
    </Alert>
  );
}
