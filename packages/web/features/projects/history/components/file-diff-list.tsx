"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileMinus,
  FilePlus,
  FilePen,
  Folder,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { FileDiffEntry, FileDiffSummary } from "../types";

type Filter = "all" | "added" | "removed" | "modified";
type DiffCounts = Record<Exclude<Filter, "all">, number>;

interface DiffTreeNode {
  name: string;
  path: string;
  type: "directory" | "file";
  children: Map<string, DiffTreeNode>;
  change: FileDiffEntry["change"] | null;
  counts: DiffCounts;
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "added", label: "Added" },
  { value: "removed", label: "Removed" },
  { value: "modified", label: "Modified" },
];

function createNode(
  name: string,
  path: string,
  type: DiffTreeNode["type"],
): DiffTreeNode {
  return {
    name,
    path,
    type,
    children: new Map(),
    change: null,
    counts: { added: 0, removed: 0, modified: 0 },
  };
}

function changeIcon(change: FileDiffEntry["change"]) {
  switch (change) {
    case "added":
      return <FilePlus className="size-4 text-emerald-600 dark:text-emerald-400" />;
    case "removed":
      return <FileMinus className="size-4 text-rose-600 dark:text-rose-400" />;
    case "modified":
      return <FilePen className="size-4 text-amber-600 dark:text-amber-400" />;
    default:
      return null;
  }
}

function changeBadgeClass(change: FileDiffEntry["change"]) {
  switch (change) {
    case "added":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "removed":
      return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400";
    case "modified":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    default:
      return "border-border text-muted-foreground";
  }
}

function buildTree(entries: FileDiffEntry[]) {
  const root = createNode("", "", "directory");

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let current = root;

    current.counts[entry.change as keyof DiffCounts] += 1;

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join("/");
      let child = current.children.get(part);

      if (!child) {
        child = createNode(part, path, isFile ? "file" : "directory");
        current.children.set(part, child);
      }

      child.counts[entry.change as keyof DiffCounts] += 1;
      if (isFile) child.change = entry.change;
      current = child;
    });
  }

  return root;
}

function sortNodes(nodes: Iterable<DiffTreeNode>) {
  return Array.from(nodes).sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function Counts({ counts }: { counts: DiffCounts }) {
  const chips = [
    { key: "added", value: counts.added, className: "text-emerald-700 dark:text-emerald-400" },
    { key: "removed", value: counts.removed, className: "text-rose-700 dark:text-rose-400" },
    { key: "modified", value: counts.modified, className: "text-amber-700 dark:text-amber-400" },
  ] as const;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {chips.map((chip) =>
        chip.value > 0 ? (
          <span
            key={chip.key}
            className={cn(
              "rounded border bg-background px-1.5 py-0.5 text-xs tabular-nums",
              chip.className,
            )}
          >
            {chip.value}
          </span>
        ) : null,
      )}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  expanded,
  onToggle,
}: {
  node: DiffTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isDirectory = node.type === "directory";
  const isExpanded = expanded.has(node.path);
  const children = sortNodes(node.children.values());

  return (
    <li>
      {isDirectory ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onToggle(node.path)}
          className="h-9 w-full justify-start rounded-none px-3 font-normal"
          style={{ paddingLeft: `${12 + depth * 18}px` }}
        >
          {isExpanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          <Folder className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-left font-mono text-xs">
            {node.name}
          </span>
          <Counts counts={node.counts} />
        </Button>
      ) : (
        <div
          className="flex h-9 items-center gap-2 border-l-2 px-3 text-sm"
          style={{ paddingLeft: `${12 + depth * 18}px` }}
        >
          {node.change ? changeIcon(node.change) : null}
          <span className="min-w-0 flex-1 truncate font-mono text-xs">
            {node.name}
          </span>
          {node.change ? (
            <span
              className={cn(
                "shrink-0 rounded border px-2 py-0.5 text-xs uppercase tracking-wide",
                changeBadgeClass(node.change),
              )}
            >
              {node.change}
            </span>
          ) : null}
        </div>
      )}

      {isDirectory && isExpanded ? (
        <ul>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FileDiffList({ summary }: { summary: FileDiffSummary }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const all: FileDiffEntry[] = [
    ...summary.added,
    ...summary.modified,
    ...summary.removed,
  ];

  const filtered = useMemo(
    () =>
      all.filter((entry) => {
        if (filter !== "all" && entry.change !== filter) return false;
        if (query && !entry.path.toLowerCase().includes(query.toLowerCase())) {
          return false;
        }
        return true;
      }),
    [all, filter, query],
  );

  const tree = useMemo(() => buildTree(filtered), [filtered]);
  const defaultExpanded = useMemo(() => {
    const paths = new Set<string>();
    const visit = (node: DiffTreeNode) => {
      if (node.type === "directory") {
        paths.add(node.path);
        for (const child of node.children.values()) visit(child);
      }
    };
    visit(tree);
    return paths;
  }, [tree]);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const expanded = useMemo(() => {
    const paths = new Set(defaultExpanded);
    for (const path of collapsedPaths) paths.delete(path);
    return paths;
  }, [collapsedPaths, defaultExpanded]);

  const counts: Record<Filter, number> = {
    all: all.length,
    added: summary.totalAdded,
    removed: summary.totalRemoved,
    modified: summary.totalModified,
  };

  function toggle(path: string) {
    setCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

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
        <div className="relative min-w-50 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter paths..."
            className="pl-8"
          />
        </div>
        <div className="flex rounded-md border bg-muted/40 p-0.5">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              type="button"
              variant={filter === f.value ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilter(f.value)}
              className="h-7 rounded px-3 text-xs tabular-nums"
            >
              {f.label}
              <span className="opacity-60">{counts[f.value]}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="font-semibold">File tree</h3>
            <p className="text-sm text-muted-foreground">
              Paths changed from base to head, grouped by directory.
            </p>
          </div>
          <Counts counts={tree.counts} />
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No files match the current filter.
          </div>
        ) : (
          <ul className="max-h-[520px] overflow-auto py-2">
            {sortNodes(tree.children.values()).map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                expanded={expanded}
                onToggle={toggle}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
