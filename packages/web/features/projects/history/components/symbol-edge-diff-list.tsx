"use client";

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FunctionSquare,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { SymbolDiffEntry, EdgeDiffEntry } from "../types";

export function SymbolDiffList({ symbols }: { symbols: SymbolDiffEntry[] }) {
  if (symbols.length === 0) {
    return (
      <Empty className="border border-dashed bg-background p-8">
        <EmptyHeader>
          <EmptyTitle>No symbol changes detected</EmptyTitle>
          <EmptyDescription>
            No added or removed symbols were found between these imports.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="divide-y rounded-lg border bg-card">
      {symbols.map((entry, idx) => {
        const positive = entry.change === "added";
        const filePath = entry.filePath ?? "Unknown file";
        return (
          <li
            key={`${filePath}-${entry.symbolName}-${idx}`}
            className={cn(
              "flex items-center gap-3 border-l-2 px-4 py-2.5",
              positive
                ? "border-l-emerald-500/40 bg-emerald-500/5"
                : "border-l-rose-500/40 bg-rose-500/5",
            )}
          >
            <FunctionSquare
              className={cn(
                "size-4",
                positive ? "text-emerald-500" : "text-rose-500",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {entry.symbolName}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {entry.kind}
                </span>
              </p>
              <p className="font-mono text-xs text-muted-foreground truncate">
                {filePath}
              </p>
            </div>
            <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
              {entry.change}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function EdgeDiffList({ edges }: { edges: EdgeDiffEntry[] }) {
  if (edges.length === 0) {
    return (
      <Empty className="border border-dashed bg-background p-8">
        <EmptyHeader>
          <EmptyTitle>No dependency edge changes</EmptyTitle>
          <EmptyDescription>
            No added or removed dependency edges were found between these
            imports.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="divide-y rounded-lg border bg-card">
      {edges.map((entry, idx) => {
        const positive = entry.change === "added";
        const importedLabel =
          entry.importedNames.length > 0
            ? entry.importedNames.slice(0, 4).join(", ")
            : null;
        return (
          <li
            key={`${entry.source}-${entry.target}-${entry.moduleSpecifier}-${idx}`}
            className={cn(
              "grid gap-3 border-l-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto]",
              positive
                ? "border-l-emerald-500/40 bg-emerald-500/5"
                : "border-l-rose-500/40 bg-rose-500/5",
            )}
          >
            <div className="min-w-0 space-y-2">
              <div className="flex min-w-0 items-center gap-2">
                {positive ? (
                  <ArrowUp className="size-4 shrink-0 text-emerald-500" />
                ) : (
                  <ArrowDown className="size-4 shrink-0 text-rose-500" />
                )}
                <span className="truncate font-mono text-xs">
                  {entry.source}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="truncate font-mono text-xs text-foreground">
                  {entry.target}
                </span>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2 pl-6">
                <Badge variant={positive ? "default" : "destructive"}>
                  {entry.change}
                </Badge>
                <Badge variant="outline">{entry.importKind}</Badge>
                {entry.isTypeOnly ? (
                  <Badge variant="secondary">type-only</Badge>
                ) : null}
                {entry.isResolved ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="size-3" />
                    resolved
                  </Badge>
                ) : (
                  <Badge variant="outline">unresolved</Badge>
                )}
                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                  {entry.moduleSpecifier}
                </span>
              </div>

              {importedLabel ? (
                <p className="truncate pl-6 font-mono text-xs text-muted-foreground">
                  imports {importedLabel}
                  {entry.importedNames.length > 4 ? "..." : ""}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-1 self-start font-mono text-xs text-muted-foreground md:justify-end">
              <Hash className="size-3" />
              <span>
                L{entry.startLine}:{entry.startCol}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
