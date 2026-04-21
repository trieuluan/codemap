"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from "reactflow";
import { cn } from "@/lib/utils";

export interface DependencyEdgeData {
  curveOffset?: number;
  relationLabel?: string;
}

function buildSoftDependencyPath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  curveOffset = 0,
}: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  curveOffset?: number;
}) {
  const deltaX = targetX - sourceX;
  const direction = deltaX >= 0 ? 1 : -1;
  const controlDistance = Math.max(Math.abs(deltaX) * 0.42, 96);
  const controlSourceX = sourceX + direction * controlDistance;
  const controlTargetX = targetX - direction * controlDistance;
  const controlSourceY = sourceY + curveOffset;
  const controlTargetY = targetY + curveOffset;

  const path = [
    `M ${sourceX},${sourceY}`,
    `C ${controlSourceX},${controlSourceY}`,
    `${controlTargetX},${controlTargetY}`,
    `${targetX},${targetY}`,
  ].join(" ");

  return {
    path,
    labelX: sourceX + (targetX - sourceX) / 2,
    labelY: sourceY + (targetY - sourceY) / 2 + curveOffset,
  };
}

export const DependencyEdge = memo(function DependencyEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  label,
  data,
}: EdgeProps<DependencyEdgeData>) {
  const displayLabel = data?.relationLabel ?? label;
  const { path, labelX, labelY } = buildSoftDependencyPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    curveOffset: data?.curveOffset,
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
