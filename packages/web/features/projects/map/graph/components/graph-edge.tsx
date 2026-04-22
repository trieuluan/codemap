"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getBezierPath,
  type EdgeProps,
} from "reactflow";
import { cn } from "@/lib/utils";

export interface DependencyEdgeData {
  curveOffset?: number;
  relationLabel?: string;
}

export const DependencyEdge = memo(function DependencyEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  label,
  data,
}: EdgeProps<DependencyEdgeData>) {
  const displayLabel = data?.relationLabel ?? label;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: sourcePosition ?? Position.Right,
    targetPosition: targetPosition ?? Position.Left,
    curvature: 0.35,
  });
  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        interactionWidth={18}
        style={{
          ...style,
          fill: "none",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      />
      {displayLabel ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "pointer-events-none absolute rounded-full border border-border/70",
              "bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold",
              "text-muted-foreground shadow-sm backdrop-blur",
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {displayLabel}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});

export const edgeTypes = {
  dependency: DependencyEdge,
};
