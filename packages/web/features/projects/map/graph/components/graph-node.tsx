"use client";

import { memo } from "react";
import { Handle, Position } from "reactflow";
import { FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ProjectMapGraphFolderNode,
  ProjectMapGraphNode,
} from "@/features/projects/api";

const LANGUAGE_ACCENT: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-400",
  Python: "bg-green-500",
  Go: "bg-cyan-500",
  Rust: "bg-orange-500",
  Java: "bg-red-500",
  Ruby: "bg-pink-500",
  CSS: "bg-purple-500",
  SCSS: "bg-purple-400",
  HTML: "bg-orange-400",
  JSON: "bg-slate-400",
  YAML: "bg-slate-400",
  Markdown: "bg-slate-400",
};

function getAccentClass(language: string | null): string {
  if (!language) return "bg-border";
  return LANGUAGE_ACCENT[language] ?? "bg-border";
}

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function ExternalRelationBadge({
  incoming = 0,
  outgoing = 0,
  compact = false,
}: {
  incoming?: number;
  outgoing?: number;
  compact?: boolean;
}) {
  if (incoming <= 0 && outgoing <= 0) {
    return null;
  }

  if (compact) {
    return (
      <span
        className="ml-auto shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-500"
        title={`External relations: ${outgoing} out / ${incoming} in`}
      >
        ext
      </span>
    );
  }

  return (
    <span
      className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-500"
      title={`External relations outside this folder: ${outgoing} out / ${incoming} in`}
    >
      ext {outgoing > 0 ? `+${outgoing} out` : ""}
      {outgoing > 0 && incoming > 0 ? " / " : ""}
      {incoming > 0 ? `+${incoming} in` : ""}
    </span>
  );
}

interface FileNodeData extends ProjectMapGraphNode {
  isInCycle?: boolean;
  zoom?: number;
  projectId?: string;
  onOpenDrawer?: (nodeId: string) => void;
  onCopyPath?: (path: string) => void;
  externalOutgoingCount?: number;
  externalIncomingCount?: number;
}

interface FileNodeProps {
  data: FileNodeData;
  selected: boolean;
}

export const FileNode = memo(function FileNode({
  data,
  selected,
}: FileNodeProps) {
  const isInCycle = data.isInCycle ?? false;
  const isCompact = (data.zoom ?? 1) < 0.45;
  if (isCompact) {
    return (
      <>
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2 py-1",
            selected
              ? "border-primary bg-primary/10"
              : isInCycle
                ? "border-destructive/50 bg-destructive/10"
                : "border-border/50 bg-card",
          )}
          style={{ width: 160, height: 28 }}
        >
          <div
            className={cn(
              "size-2 shrink-0 rounded-full",
              getAccentClass(data.language),
            )}
          />
          <p className="truncate font-mono text-[10px] leading-none text-foreground">
            {getFileName(data.path)}
          </p>
          <ExternalRelationBadge
            incoming={data.externalIncomingCount}
            outgoing={data.externalOutgoingCount}
            compact
          />
          <Handle
            id="left"
            type="target"
            position={Position.Left}
            className="!size-1.5 opacity-0"
          />
          <Handle
            id="right"
            type="source"
            position={Position.Right}
            className="!size-1.5 opacity-0"
          />
          <Handle
            id="top"
            type="target"
            position={Position.Top}
            className="!size-1.5 opacity-0"
          />
          <Handle
            id="bottom"
            type="source"
            position={Position.Bottom}
            className="!size-1.5 opacity-0"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          "relative flex overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm",
          "w-[240px] cursor-pointer transition-all",
          selected
            ? "border-primary shadow-md ring-1 ring-primary"
            : isInCycle
              ? "border-destructive/50 bg-destructive/5 hover:border-destructive/70 hover:shadow-md"
              : "border-border/70 hover:border-border hover:shadow-md",
        )}
      >
        {/* Left accent strip */}
        <div
          className={cn(
            "w-1 shrink-0 self-stretch",
            getAccentClass(data.language),
          )}
        />

        <div className="min-w-0 flex-1 px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-mono text-xs font-semibold leading-tight text-foreground">
              {getFileName(data.path)}
            </p>
            {isInCycle ? (
              <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-destructive">
                Cycle
              </span>
            ) : null}
            <ExternalRelationBadge
              incoming={data.externalIncomingCount}
              outgoing={data.externalOutgoingCount}
            />
          </div>
          {data.dirPath && (
            <p className="truncate text-[10px] leading-tight text-muted-foreground/60 mt-0.5">
              {data.dirPath}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            {data.language && (
              <span className="text-[10px] font-medium text-muted-foreground">
                {data.language}
              </span>
            )}
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span title="Incoming">↓{data.incomingCount}</span>
              <span title="Outgoing">↑{data.outgoingCount}</span>
            </span>
          </div>
        </div>

        <Handle
          id="left"
          type="target"
          position={Position.Left}
          className="!size-2 !border-border !bg-muted-foreground/40"
        />
        <Handle
          id="right"
          type="source"
          position={Position.Right}
          className="!size-2 !border-border !bg-muted-foreground/40"
        />
        <Handle
          id="top"
          type="target"
          position={Position.Top}
          className="!size-2 !border-border !bg-muted-foreground/40"
        />
        <Handle
          id="bottom"
          type="source"
          position={Position.Bottom}
          className="!size-2 !border-border !bg-muted-foreground/40"
        />
      </div>
    </>
  );
});

interface FolderOverviewNodeData extends ProjectMapGraphFolderNode {
  zoom?: number;
  externalOutgoingCount?: number;
  externalIncomingCount?: number;
}

interface FolderOverviewNodeProps {
  data: FolderOverviewNodeData;
  selected: boolean;
}

export const FolderOverviewNode = memo(function FolderOverviewNode({
  data,
  selected,
}: FolderOverviewNodeProps) {
  const isCompact = (data.zoom ?? 1) < 0.45;
  const hasExternalRelations =
    (data.externalIncomingCount ?? 0) > 0 ||
    (data.externalOutgoingCount ?? 0) > 0;

  if (isCompact) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm",
          selected ? "border-primary ring-1 ring-primary" : "border-border/70",
        )}
        style={{ width: 180, height: 42 }}
      >
        <FolderTree className="size-4 shrink-0 text-muted-foreground" />
        <p className="truncate font-mono text-xs font-semibold text-foreground">
          {data.folder}
        </p>
        <ExternalRelationBadge
          incoming={data.externalIncomingCount}
          outgoing={data.externalOutgoingCount}
          compact
        />
        <Handle
          type="target"
          position={Position.Left}
          className="!size-2 opacity-0"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!size-2 opacity-0"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-[260px] cursor-pointer rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-all",
        selected
          ? "border-primary shadow-md ring-1 ring-primary"
          : "border-border/70 hover:border-border hover:shadow-md",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FolderTree className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-semibold text-foreground">
            {data.folder}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.sourceFileCount} source files · {data.fileCount} files
          </p>
          {hasExternalRelations ? (
            <div className="mt-2">
              <ExternalRelationBadge
                incoming={data.externalIncomingCount}
                outgoing={data.externalOutgoingCount}
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md bg-muted/60 px-2 py-1">
          <p className="font-semibold text-foreground">{data.outgoingCount}</p>
          <p className="text-muted-foreground">out</p>
        </div>
        <div className="rounded-md bg-muted/60 px-2 py-1">
          <p className="font-semibold text-foreground">{data.incomingCount}</p>
          <p className="text-muted-foreground">in</p>
        </div>
        <div className="rounded-md bg-muted/60 px-2 py-1">
          <p className="font-semibold text-foreground">
            {data.internalEdgeCount}
          </p>
          <p className="text-muted-foreground">edges</p>
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2 !border-border !bg-muted-foreground/40"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-border !bg-muted-foreground/40"
      />
    </div>
  );
});

export const nodeTypes = {
  fileNode: FileNode,
  folderOverview: FolderOverviewNode,
};
