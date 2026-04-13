"use client";

import { Code2, GitBranch, ListTree, Route } from "lucide-react";
import type { RepositoryTreeNode } from "./file-tree-model";

interface DetailPanelProps {
  file: RepositoryTreeNode;
  activeView: "structure" | "dependencies" | "entry-points";
}

const mockDependencies = [
  "react@19.0.0",
  "next@16.2.2",
  "drizzle-orm@0.45.2",
  "tailwindcss@4.2.2",
];

const mockStructure = [
  { name: "Exports", count: 5 },
  { name: "Interfaces", count: 3 },
  { name: "Functions", count: 8 },
  { name: "Types", count: 12 },
];

const mockEntryPoints = [
  { path: "src/index.ts", type: "Main entry" },
  { path: "src/hooks/index.ts", type: "Hooks" },
  { path: "src/utils/index.ts", type: "Utils" },
];

export function DetailPanel({ file, activeView }: DetailPanelProps) {
  const fileExtension =
    file.type === "folder"
      ? "DIRECTORY"
      : file.extension?.toUpperCase() ||
        file.name.split(".").pop()?.toUpperCase() ||
        "FILE";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-accent">
            <Code2 className="h-5 w-5 text-sidebar-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {fileExtension} • {file.language || "Source file"} •{" "}
              {file.size ? `${(file.size / 1024).toFixed(1)}kb` : "N/A"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="rounded-lg border border-border/70 bg-background/70 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Type
          </p>
          <p className="mt-2 text-sm capitalize">{file.type}</p>
          {file.path ? (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {file.path}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-border/70 bg-background/70 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tags
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">
              {file.language || "Unknown"}
            </span>
            <span className="rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">
              {file.type === "folder" ? "Directory" : "Module"}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/70 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Description
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Mock analysis for now. This panel will eventually show extracted
            summaries, ownership hints, and architecture annotations for the
            selected module.
          </p>
        </div>

        {activeView === "structure" ? (
          <div className="rounded-lg border border-border/70 bg-background/70 p-4">
            <div className="mb-4 flex items-center gap-2">
              <ListTree className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium">Structure</p>
            </div>
            <div className="space-y-3">
              {mockStructure.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-lg bg-sidebar-accent p-3"
                >
                  <span className="text-sm">{item.name}</span>
                  <span className="text-sm font-semibold text-primary">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeView === "dependencies" ? (
          <div className="rounded-lg border border-border/70 bg-background/70 p-4">
            <div className="mb-4 flex items-center gap-2">
              <GitBranch className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium">Dependencies</p>
            </div>
            <div className="space-y-3">
              {mockDependencies.map((dependency) => (
                <div
                  key={dependency}
                  className="rounded-lg bg-sidebar-accent p-3 text-sm font-mono"
                >
                  {dependency}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeView === "entry-points" ? (
          <div className="rounded-lg border border-border/70 bg-background/70 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Route className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium">Entry points</p>
            </div>
            <div className="space-y-3">
              {mockEntryPoints.map((entry) => (
                <div key={entry.path} className="rounded-lg bg-sidebar-accent p-3">
                  <p className="text-xs text-muted-foreground">{entry.type}</p>
                  <p className="mt-1 text-sm font-mono text-foreground">
                    {entry.path}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
