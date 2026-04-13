"use client";

import { Binary, Code2, FolderTree, Hash, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getFileKind } from "@/lib/file-types";
import type { RepositoryTreeNode } from "./file-tree-model";
import { getRepositoryNodeChildCount } from "./file-tree-model";

interface DetailPanelProps {
  file: RepositoryTreeNode;
}

function getDisplayExtension(file: RepositoryTreeNode) {
  if (file.type === "folder") {
    return "DIRECTORY";
  }

  return (
    file.extension?.toUpperCase() ||
    file.name.split(".").pop()?.toUpperCase() ||
    "FILE"
  );
}
export function DetailPanel({ file }: DetailPanelProps) {
  const fileKind = getFileKind({
    name: file.name,
    extension: file.extension,
    isDirectory: file.type === "folder",
  });
  const fileExtension = getDisplayExtension(file);
  const childCount = getRepositoryNodeChildCount(file);

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
              {fileExtension} • {file.language || "Unknown language"} •{" "}
              {file.type === "folder"
                ? `${childCount} item${childCount === 1 ? "" : "s"}`
                : file.size
                  ? `${(file.size / 1024).toFixed(1)}kb`
                  : "Size unavailable"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-background/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Tag className="size-4 text-muted-foreground" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Classification
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{file.type === "folder" ? "Directory" : "File"}</Badge>
              <Badge variant="secondary" className="capitalize">
                {fileKind}
              </Badge>
              <Badge variant="secondary">{file.language || "Unknown language"}</Badge>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Hash className="size-4 text-muted-foreground" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Technical
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Extension:</span>{" "}
                {fileExtension}
              </p>
              <p>
                <span className="text-muted-foreground">Kind:</span>{" "}
                <span className="capitalize">{fileKind}</span>
              </p>
              {file.type === "folder" ? (
                <p>
                  <span className="text-muted-foreground">Children:</span>{" "}
                  {childCount}
                </p>
              ) : (
                <p>
                  <span className="text-muted-foreground">Size:</span>{" "}
                  {file.size ? `${(file.size / 1024).toFixed(1)}kb` : "Unavailable"}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/70 p-4">
          <div className="mb-3 flex items-center gap-2">
            <FolderTree className="size-4 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Repository path
            </p>
          </div>
          <div className="rounded-md bg-sidebar-accent/40 p-3">
            <p className="break-all font-mono text-xs text-foreground">
              {file.path || file.name}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/70 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Binary className="size-4 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Mapping summary
            </p>
          </div>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              CodeMap has loaded the repository tree for this node. Deeper mapped
              entities such as dependencies, symbols, and entry points are not yet
              available in this workspace.
            </p>
            <p>
              Selected {file.type === "folder" ? "directory" : "file"} kind:{" "}
              <span className="font-medium capitalize text-foreground">{fileKind}</span>
            </p>
            <p>
              Full path is available above so you can quickly inspect location
              and classify the selected repository node.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
