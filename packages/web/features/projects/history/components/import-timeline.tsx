"use client";

import { GitCommit } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
  return { fileDelta, symbolDelta };
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
    <ol className="relative space-y-3 pl-6">
      <span
        aria-hidden
        className="absolute left-2 top-2 bottom-2 w-px bg-border"
      />
      {imports.map((imp, idx) => {
        const prev = imports[idx + 1];
        const delta = describeDelta(imp, prev);
        const isSelected = selectedId === imp.id;
        const isBase = baseId === imp.id;
        const isHead = headId === imp.id;
        const inComparison = compareMode && (isBase || isHead);

        return (
          <li key={imp.id} className="relative">
            <span
              aria-hidden
              className={cn(
                "absolute -left-[18px] top-4 grid size-4 place-items-center rounded-full border-2 bg-background",
                inComparison
                  ? isHead
                    ? "border-primary"
                    : "border-amber-500"
                  : isSelected
                    ? "border-primary"
                    : "border-border",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  inComparison
                    ? isHead
                      ? "bg-primary"
                      : "bg-amber-500"
                    : isSelected
                      ? "bg-primary"
                      : "bg-muted-foreground/40",
                )}
              />
            </span>

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
                "group block w-full rounded-lg border bg-card p-4 text-left transition",
                "hover:border-primary/50 hover:bg-accent/40",
                isSelected && !compareMode && "border-primary/60 bg-accent/30",
                isHead && compareMode && "border-primary/60 bg-primary/5",
                isBase && compareMode && "border-amber-500/60 bg-amber-500/5",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProjectImportStatusBadge status={imp.status} />
                    {imp.branch ? (
                      <Badge variant="secondary" className="font-mono text-xs">
                        {imp.branch}
                      </Badge>
                    ) : null}
                    {compareMode && isBase ? (
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                        BASE
                      </Badge>
                    ) : null}
                    {compareMode && isHead ? (
                      <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                        HEAD
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <GitCommit className="size-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs text-muted-foreground">
                      {shortSha(imp.commitSha)}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <LocalProjectDate
                      value={imp.completedAt ?? imp.startedAt}
                      className="text-xs text-muted-foreground"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {delta ? (
                    <>
                      <DeltaPill value={delta.fileDelta} suffix="files" />
                      <DeltaPill value={delta.symbolDelta} suffix="sym" />
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Initial import
                    </span>
                  )}
                </div>
              </div>

              {compareMode ? (
                <div className="mt-3 flex gap-2 border-t border-border/60 pt-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetBase(imp.id);
                    }}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1 text-xs font-medium transition",
                      isBase
                        ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        : "border-border text-muted-foreground hover:border-amber-500/50 hover:text-foreground",
                    )}
                  >
                    Set as base
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetHead(imp.id);
                    }}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1 text-xs font-medium transition",
                      isHead
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                    )}
                  >
                    Set as head
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
