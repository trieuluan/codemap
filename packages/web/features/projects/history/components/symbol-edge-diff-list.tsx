"use client";

import { ArrowDown, ArrowUp, FunctionSquare, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
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
            Symbol-level diff requires per-import symbol indexing. Once the
            backend exposes <code className="font-mono text-xs">/imports/:id/symbols-per-file</code>,
            this view will populate automatically.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="divide-y rounded-lg border bg-card">
      {symbols.map((entry, idx) => {
        const positive = entry.change === "added";
        return (
          <li
            key={`${entry.filePath}-${entry.symbolName}-${idx}`}
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
                {entry.filePath}
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
            Edge-level diff requires per-import edge listing. Once
            <code className="mx-1 font-mono text-xs">/imports/:id/edges</code>
            is available, added/removed imports will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="divide-y rounded-lg border bg-card">
      {edges.map((entry, idx) => {
        const positive = entry.change === "added";
        return (
          <li
            key={`${entry.source}-${entry.target}-${idx}`}
            className={cn(
              "flex items-center gap-3 border-l-2 px-4 py-2.5 text-sm",
              positive
                ? "border-l-emerald-500/40 bg-emerald-500/5"
                : "border-l-rose-500/40 bg-rose-500/5",
            )}
          >
            {positive ? (
              <ArrowUp className="size-4 text-emerald-500" />
            ) : (
              <ArrowDown className="size-4 text-rose-500" />
            )}
            <span className="font-mono text-xs truncate flex-1">
              {entry.source}{" "}
              <span className="text-muted-foreground">→</span>{" "}
              <span className="text-foreground">{entry.target}</span>
            </span>
            <Hash className="size-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {entry.importKind}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
