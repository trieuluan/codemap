import { BookOpen, GitBranch, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LocalProjectDate } from "../../components/local-project-date";
import { ProjectImportStatusBadge } from "../../components/project-import-status-badge";
import type { ProjectImport, ProjectImportParseStatus } from "@/features/projects/api";
import { getProjectImportParseStatusLabel } from "../../utils/project-helpers";

export const parseStatusStyles: Record<string, string> = {
  completed: "text-emerald-600 dark:text-emerald-400",
  partial: "text-amber-600 dark:text-amber-400",
  failed: "text-destructive",
  running: "text-blue-600 dark:text-blue-400",
  pending: "text-muted-foreground",
  queued: "text-muted-foreground",
};

export function formatDuration(startedAt: string, completedAt: string): string {
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

export function ParseStatusRow({
  parseStatus,
}: {
  parseStatus: ProjectImportParseStatus;
}) {
  const label = getProjectImportParseStatusLabel(parseStatus);
  const colorClass = parseStatusStyles[parseStatus] ?? "text-muted-foreground";
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <BookOpen className="size-3 text-muted-foreground" />
      <span className="text-muted-foreground">Parse:</span>
      <span className={cn("font-medium", colorClass)}>{label}</span>
    </div>
  );
}

export function ImportRow({
  imp,
}: {
  imp: ProjectImport & { commitMessage?: string | null };
}) {
  const isActive =
    imp.status === "pending" || imp.status === "queued" || imp.status === "running";
  const duration =
    imp.completedAt ? formatDuration(imp.startedAt, imp.completedAt) : null;

  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <div className="mt-0.5 shrink-0">
        <ProjectImportStatusBadge status={imp.status} />
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {imp.branch ? (
            <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
              <GitBranch className="size-3" />
              {imp.branch}
            </span>
          ) : null}
          {imp.commitMessage ? (
            <span className="truncate text-xs text-foreground">{imp.commitMessage}</span>
          ) : null}
        </div>

        {imp.status === "completed" && imp.parseStatus ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Parse:</span>
            <span
              className={cn(
                "font-medium",
                parseStatusStyles[imp.parseStatus] ?? "text-muted-foreground",
              )}
            >
              {getProjectImportParseStatusLabel(imp.parseStatus)}
            </span>
            {imp.parseStatus === "completed" || imp.parseStatus === "partial" ? (
              <span className="text-muted-foreground">
                · {imp.indexedFileCount.toLocaleString()} files ·{" "}
                {imp.indexedSymbolCount.toLocaleString()} symbols
              </span>
            ) : null}
          </div>
        ) : null}

        {isActive ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            In progress…
          </div>
        ) : null}
      </div>

      <div className="shrink-0 text-right text-xs text-muted-foreground space-y-0.5">
        <LocalProjectDate value={imp.startedAt} />
        {duration ? (
          <p className="text-[10px] text-muted-foreground/60">{duration}</p>
        ) : null}
      </div>
    </li>
  );
}
