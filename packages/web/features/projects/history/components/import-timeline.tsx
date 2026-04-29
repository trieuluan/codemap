"use client";

import { GitCommit } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocalProjectDate } from "@/features/projects/components/local-project-date";
import { ProjectImportStatusBadge } from "@/features/projects/components/project-import-status-badge";
import type { ProjectImport } from "@/features/projects/api";

interface Props {
  imports: ProjectImport[];
  selectedId: string | null;
  baseId: string | null;
  headId: string | null;
  compareMode: boolean;
  onSelect: (importId: string) => void;
  onSetBase: (importId: string) => void;
  onSetHead: (importId: string) => void;
}

function shortSha(sha: string | null) {
  return sha ? sha.slice(0, 7) : "—";
}

function describeDelta(curr: ProjectImport, prev: ProjectImport | undefined) {
  if (!prev) return null;
  const fileDelta = curr.indexedFileCount - prev.indexedFileCount;
  const symbolDelta = curr.indexedSymbolCount - prev.indexedSymbolCount;
  const edgeDelta = curr.indexedEdgeCount - prev.indexedEdgeCount;
  return { fileDelta, symbolDelta, edgeDelta };
}

function DeltaPill({ value, suffix }: { value: number; suffix: string }) {
  if (value === 0) return null;
  const positive = value > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
        positive
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-rose-500/10 text-rose-700 dark:text-rose-400",
      )}
    >
      {positive ? "+" : ""}
      {value.toLocaleString()} {suffix}
    </span>
  );
}

export function ImportTimeline({
  imports,
  selectedId,
  baseId,
  headId,
  compareMode,
  onSelect,
  onSetBase,
  onSetHead,
}: Props) {
  return (
    <ol className="space-y-3">
      {imports.map((imp, idx) => {
        const prev = imports[idx + 1];
        const delta = describeDelta(imp, prev);
        const isSelected = selectedId === imp.id;
        const isBase = baseId === imp.id;
        const isHead = headId === imp.id;
        const inComparison = compareMode && (isBase || isHead);

        return (
          <li key={imp.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(imp.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(imp.id);
                }
              }}
              className={cn(
                "group block w-full rounded-lg border bg-card p-4 text-left shadow-sm transition",
                "hover:border-primary/40 hover:bg-accent/30",
                isSelected && !compareMode && "border-primary/55 bg-primary/5",
                isHead && compareMode && "border-primary/55 bg-primary/5",
                isBase && compareMode && "border-amber-500/55 bg-amber-500/5",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        imp.status === "failed"
                          ? "bg-destructive"
                          : imp.status === "completed"
                            ? "bg-emerald-500"
                            : "bg-amber-500",
                      )}
                    />
                    <span className="font-mono text-sm font-semibold">
                      {shortSha(imp.commitSha)}
                    </span>
                    {imp.branch ? (
                      <span className="text-sm text-muted-foreground">
                        {imp.branch}
                      </span>
                    ) : null}
                  </div>
                  {imp.commitMessage ? (
                    <p className="line-clamp-2 text-sm font-medium text-foreground">
                      {imp.commitMessage}
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-muted-foreground">
                      No commit message available
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <GitCommit className="size-3.5 text-muted-foreground" />
                    <LocalProjectDate
                      value={imp.completedAt ?? imp.startedAt}
                      className="text-xs text-muted-foreground"
                    />
                    <ProjectImportStatusBadge status={imp.status} />
                  </div>
                  {imp.errorMessage || imp.parseError ? (
                    <p className="line-clamp-2 font-mono text-xs text-destructive">
                      {imp.errorMessage ?? imp.parseError}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {compareMode && isBase ? (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                      BASE
                    </Badge>
                  ) : null}
                  {compareMode && isHead ? (
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      HEAD
                    </Badge>
                  ) : null}
                  {delta ? (
                    <div className="flex max-w-40 flex-wrap justify-end gap-1.5">
                      <DeltaPill value={delta.fileDelta} suffix="files" />
                      <DeltaPill value={delta.symbolDelta} suffix="sym" />
                      <DeltaPill value={delta.edgeDelta} suffix="edges" />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Initial import
                    </span>
                  )}
                </div>
              </div>

              {compareMode ? (
                <div className="mt-3 flex gap-2 border-t border-border/60 pt-3">
                  <Button
                    type="button"
                    variant={isBase ? "secondary" : "outline"}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetBase(imp.id);
                    }}
                    className={cn(
                      "flex-1",
                      isBase
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400"
                        : "text-muted-foreground hover:border-amber-500/50 hover:text-foreground",
                    )}
                  >
                    Set as base
                  </Button>
                  <Button
                    type="button"
                    variant={isHead ? "secondary" : "outline"}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetHead(imp.id);
                    }}
                    className={cn(
                      "flex-1",
                      isHead
                        ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                        : "text-muted-foreground hover:border-primary/50 hover:text-foreground",
                    )}
                  >
                    Set as head
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
