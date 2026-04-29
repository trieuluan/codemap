"use client";

import { useState } from "react";
import { FileMinus, FilePlus, FilePen, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { FileDiffSummary, FileDiffEntry } from "../types";

type Filter = "all" | "added" | "removed" | "modified";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "added", label: "Added" },
  { value: "removed", label: "Removed" },
  { value: "modified", label: "Modified" },
];

function changeIcon(change: FileDiffEntry["change"]) {
  switch (change) {
    case "added":
      return <FilePlus className="size-4 text-emerald-500" />;
    case "removed":
      return <FileMinus className="size-4 text-rose-500" />;
    case "modified":
      return <FilePen className="size-4 text-amber-500" />;
    default:
      return null;
  }
}

function changeBg(change: FileDiffEntry["change"]) {
  switch (change) {
    case "added":
      return "bg-emerald-500/5 border-emerald-500/20";
    case "removed":
      return "bg-rose-500/5 border-rose-500/20";
    case "modified":
      return "bg-amber-500/5 border-amber-500/20";
    default:
      return "border-border";
  }
}

export function FileDiffList({ summary }: { summary: FileDiffSummary }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const all: FileDiffEntry[] = [
    ...summary.added,
    ...summary.modified,
    ...summary.removed,
  ];

  const filtered = all.filter((entry) => {
    if (filter !== "all" && entry.change !== filter) return false;
    if (query && !entry.path.toLowerCase().includes(query.toLowerCase())) {
      return false;
    }
    return true;
  });

  const counts: Record<Filter, number> = {
    all: all.length,
    added: summary.totalAdded,
    removed: summary.totalRemoved,
    modified: summary.totalModified,
  };

  if (all.length === 0) {
    return (
      <Empty className="border border-dashed bg-background p-8">
        <EmptyHeader>
          <EmptyTitle>No file changes</EmptyTitle>
          <EmptyDescription>
            File trees are identical between these two imports. Symbols and
            dependencies may still differ — check the other tabs.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter paths…"
            className="pl-8"
          />
        </div>
        <div className="flex rounded-md border bg-muted/40 p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition tabular-nums",
                filter === f.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="ml-1.5 opacity-60">{counts[f.value]}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="divide-y rounded-lg border bg-card">
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            No files match the current filter.
          </li>
        ) : (
          filtered.map((entry) => (
            <li
              key={`${entry.change}-${entry.path}`}
              className={cn(
                "flex items-center gap-3 border-l-2 px-4 py-2.5 text-sm",
                changeBg(entry.change),
              )}
            >
              {changeIcon(entry.change)}
              <span className="font-mono text-xs truncate flex-1">
                {entry.path}
              </span>
              <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                {entry.change}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
