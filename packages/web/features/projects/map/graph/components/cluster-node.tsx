"use client";

import { memo } from "react";
import { Handle, Position } from "reactflow";
import { Layers, ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type ClusterDirection = "incoming" | "outgoing";

export interface ClusterNodeData {
  kind: "cluster";
  direction: ClusterDirection;
  focusId: string;
  nodeIds: string[];
  count: number;
  sample: string[];
  zoom?: number;
  onExpand?: (clusterId: string) => void;
}

interface ClusterNodeProps {
  id: string;
  data: ClusterNodeData;
  selected: boolean;
}

export const ClusterNode = memo(function ClusterNode({
  id,
  data,
  selected,
}: ClusterNodeProps) {
  const isCompact = (data.zoom ?? 1) < 0.45;
  const label =
    data.direction === "incoming"
      ? `${data.count} importers`
      : `${data.count} imports`;
  const subtitleIcon =
    data.direction === "incoming" ? (
      <ArrowDown className="size-3" />
    ) : (
      <ArrowUp className="size-3" />
    );

  const handleClick = () => {
    data.onExpand?.(id);
  };

  if (isCompact) {
    return (
      <div
        onClick={handleClick}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-2 py-1 transition-colors",
          selected
            ? "border-primary bg-primary/10"
            : "border-muted-foreground/40 bg-muted/40 hover:border-muted-foreground/60",
        )}
        style={{ width: 180, height: 32 }}
        title={`Click to expand ${data.count} files`}
      >
        <Layers className="size-3 shrink-0 text-muted-foreground" />
        <p className="truncate text-[10px] font-medium leading-none text-foreground">
          {label}
        </p>
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
    );
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        "relative flex w-[220px] cursor-pointer flex-col gap-1.5 rounded-lg border border-dashed bg-card/80 px-3 py-2.5 text-card-foreground shadow-sm transition-all",
        selected
          ? "border-primary ring-1 ring-primary"
          : "border-muted-foreground/40 hover:border-muted-foreground/70 hover:shadow-md",
      )}
      title={`Click to expand all ${data.count} files`}
    >
      <div className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Layers className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">
            {label}
          </p>
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {subtitleIcon}
            {data.direction === "incoming" ? "imports this" : "imported here"}
          </p>
        </div>
      </div>

      {data.sample.length > 0 ? (
        <div className="space-y-0.5 rounded-md bg-muted/40 px-2 py-1 text-[10px] font-mono text-muted-foreground">
          {data.sample.map((name) => (
            <p key={name} className="truncate">
              · {name}
            </p>
          ))}
          {data.count > data.sample.length ? (
            <p className="truncate text-muted-foreground/70">
              + {data.count - data.sample.length} more…
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-center text-[10px] font-medium uppercase tracking-wide text-primary/80">
        Click to expand
      </p>

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
  );
});
