"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
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

// ---- SymbolDiffList --------------------------------------------------------

type SymbolGroup = {
  filePath: string;
  added: SymbolDiffEntry[];
  removed: SymbolDiffEntry[];
};

function groupSymbolsByFile(symbols: SymbolDiffEntry[]): SymbolGroup[] {
  const map = new Map<string, SymbolGroup>();
  for (const s of symbols) {
    const key = s.filePath ?? "Unknown file";
    if (!map.has(key)) map.set(key, { filePath: key, added: [], removed: [] });
    if (s.change === "added") map.get(key)!.added.push(s);
    else map.get(key)!.removed.push(s);
  }

  for (const group of map.values()) {
    const addedKeys = new Set(group.added.map((s) => `${s.symbolName}::${s.kind}`));
    const removedKeys = new Set(group.removed.map((s) => `${s.symbolName}::${s.kind}`));
    const dups = new Set([...addedKeys].filter((k) => removedKeys.has(k)));
    if (dups.size > 0) {
      group.added = group.added.filter((s) => !dups.has(`${s.symbolName}::${s.kind}`));
      group.removed = group.removed.filter((s) => !dups.has(`${s.symbolName}::${s.kind}`));
    }
  }

  return Array.from(map.values())
    .filter((g) => g.added.length > 0 || g.removed.length > 0)
    .sort(
      (a, b) =>
        b.added.length + b.removed.length - (a.added.length + a.removed.length),
    );
}

export function SymbolDiffList({ symbols }: { symbols: SymbolDiffEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const groups = groupSymbolsByFile(symbols);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>File</span>
        <span className="w-20 text-right text-emerald-500">Added</span>
        <span className="w-20 text-right text-rose-500">Removed</span>
      </div>
      <ul className="divide-y">
        {groups.map((group) => {
          const isOpen = expanded.has(group.filePath);
          const fileName = group.filePath.split("/").pop() ?? group.filePath;
          const dirPath = group.filePath.includes("/")
            ? group.filePath.slice(0, group.filePath.lastIndexOf("/"))
            : null;

          return (
            <li key={group.filePath}>
              <button
                type="button"
                onClick={() => toggle(group.filePath)}
                className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
              >
                {isOpen ? (
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {fileName}
                  </span>
                  {dirPath ? (
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {dirPath}
                    </span>
                  ) : null}
                </span>
                <span className="w-20 text-right font-mono text-sm tabular-nums text-emerald-500">
                  {group.added.length > 0 ? `+${group.added.length}` : "—"}
                </span>
                <span className="w-20 text-right font-mono text-sm tabular-nums text-rose-500">
                  {group.removed.length > 0 ? `-${group.removed.length}` : "—"}
                </span>
              </button>

              {isOpen ? (
                <ul className="divide-y border-t bg-muted/20">
                  {[...group.added, ...group.removed].map((entry, idx) => {
                    const positive = entry.change === "added";
                    return (
                      <li
                        key={`${entry.symbolName}-${idx}`}
                        className={cn(
                          "flex items-center gap-3 border-l-2 px-6 py-2",
                          positive
                            ? "border-l-emerald-500/40"
                            : "border-l-rose-500/40",
                        )}
                      >
                        <FunctionSquare
                          className={cn(
                            "size-3.5 shrink-0",
                            positive ? "text-emerald-500" : "text-rose-500",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {entry.symbolName}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {entry.kind}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-xs font-medium tabular-nums",
                            positive ? "text-emerald-500" : "text-rose-500",
                          )}
                        >
                          {positive ? "+1" : "-1"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- EdgeDiffList ----------------------------------------------------------

type EdgeGroup = {
  sourceFile: string;
  added: EdgeDiffEntry[];
  removed: EdgeDiffEntry[];
};

function groupEdgesBySource(edges: EdgeDiffEntry[]): EdgeGroup[] {
  const map = new Map<string, EdgeGroup>();
  for (const e of edges) {
    const key = e.source;
    if (!map.has(key))
      map.set(key, { sourceFile: key, added: [], removed: [] });
    if (e.change === "added") map.get(key)!.added.push(e);
    else map.get(key)!.removed.push(e);
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      b.added.length + b.removed.length - (a.added.length + a.removed.length),
  );
}

export function EdgeDiffList({ edges }: { edges: EdgeDiffEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const groups = groupEdgesBySource(edges);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>Source file</span>
        <span className="w-20 text-right text-emerald-500">Added</span>
        <span className="w-20 text-right text-rose-500">Removed</span>
      </div>
      <ul className="divide-y">
        {groups.map((group) => {
          const isOpen = expanded.has(group.sourceFile);
          const fileName =
            group.sourceFile.split("/").pop() ?? group.sourceFile;
          const dirPath = group.sourceFile.includes("/")
            ? group.sourceFile.slice(0, group.sourceFile.lastIndexOf("/"))
            : null;

          return (
            <li key={group.sourceFile}>
              <button
                type="button"
                onClick={() => toggle(group.sourceFile)}
                className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
              >
                {isOpen ? (
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {fileName}
                  </span>
                  {dirPath ? (
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {dirPath}
                    </span>
                  ) : null}
                </span>
                <span className="w-20 text-right font-mono text-sm tabular-nums text-emerald-500">
                  {group.added.length > 0 ? `+${group.added.length}` : "—"}
                </span>
                <span className="w-20 text-right font-mono text-sm tabular-nums text-rose-500">
                  {group.removed.length > 0 ? `-${group.removed.length}` : "—"}
                </span>
              </button>

              {isOpen ? (
                <ul className="divide-y border-t bg-muted/20">
                  {[...group.added, ...group.removed].map((entry, idx) => {
                    const positive = entry.change === "added";
                    const importedLabel =
                      entry.importedNames.length > 0
                        ? entry.importedNames.slice(0, 3).join(", ")
                        : null;
                    return (
                      <li
                        key={`${entry.target}-${entry.moduleSpecifier}-${idx}`}
                        className={cn(
                          "flex items-start gap-3 border-l-2 px-6 py-2.5",
                          positive
                            ? "border-l-emerald-500/40"
                            : "border-l-rose-500/40",
                        )}
                      >
                        {positive ? (
                          <ArrowUp className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <ArrowDown className="mt-0.5 size-3.5 shrink-0 text-rose-500" />
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          <span className="block truncate font-mono text-xs">
                            {entry.target}
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="h-4 text-[10px]">
                              {entry.importKind}
                            </Badge>
                            {entry.isTypeOnly ? (
                              <Badge
                                variant="secondary"
                                className="h-4 text-[10px]"
                              >
                                type-only
                              </Badge>
                            ) : null}
                            {entry.isResolved ? (
                              <Badge
                                variant="secondary"
                                className="h-4 gap-1 text-[10px]"
                              >
                                <CheckCircle2 className="size-2.5" />
                                resolved
                              </Badge>
                            ) : null}
                            <span className="truncate font-mono text-[10px] text-muted-foreground">
                              {entry.moduleSpecifier}
                            </span>
                          </div>
                          {importedLabel ? (
                            <p className="truncate font-mono text-[10px] text-muted-foreground">
                              imports {importedLabel}
                              {entry.importedNames.length > 3 ? "…" : ""}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground">
                          <Hash className="size-3" />
                          L{entry.startLine}:{entry.startCol}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
