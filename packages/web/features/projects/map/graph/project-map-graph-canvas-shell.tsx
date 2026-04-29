"use client";

import { FolderTree, Loader2 } from "lucide-react";
import type { ProjectMapGraphResponse } from "@/features/projects/api";
import type {
  FolderGraphLayoutResult,
  FolderStructureLayoutResult,
  GraphLayoutResult,
  GraphRelationMode,
} from "./utils/graph-layout";
import type { GraphMode } from "./project-map-graph-shared";
import { GraphCanvas } from "./components/graph-canvas";

interface ProjectMapGraphCanvasShellProps {
  mode: GraphMode;
  graphData: ProjectMapGraphResponse;
  activeLayout:
    | FolderGraphLayoutResult
    | FolderStructureLayoutResult
    | GraphLayoutResult
    | null;
  activeCycleNodeIds: Set<string>;
  selectedNodeId: string | null;
  highlightedNodeIds?: Set<string>;
  relationMode: GraphRelationMode;
  projectId: string;
  isLayouting: boolean;
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onOpenDrawer: (nodeId: string) => void;
  onCopyPath: (path: string) => void;
  onExpandCluster: (clusterId: string) => void;
}

export function ProjectMapGraphCanvasShell({
  mode,
  graphData,
  activeLayout,
  activeCycleNodeIds,
  selectedNodeId,
  highlightedNodeIds,
  relationMode,
  projectId,
  isLayouting,
  onNodeClick,
  onNodeDoubleClick,
  onOpenDrawer,
  onCopyPath,
  onExpandCluster,
}: ProjectMapGraphCanvasShellProps) {
  return (
    <div className="relative flex-1 overflow-hidden rounded-lg border border-border/70 bg-card">
      {isLayouting ? (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Computing layout...</p>
        </div>
      ) : activeLayout && activeLayout.nodes.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm font-medium text-foreground">
            {mode === "overview"
              ? "No folder graph available"
              : mode === "structure"
                ? "No immediate children found"
                : "No related files found"}
          </p>
          <p className="text-xs text-muted-foreground">
            {mode === "overview"
              ? "No cross-folder dependencies were indexed yet."
              : mode === "structure"
                ? "This folder may only contain files without indexed semantic data."
                : "This file has no indexed internal dependency edges yet."}
          </p>
        </div>
      ) : activeLayout ? (
        <>
          {mode === "overview" && graphData.stats.folderEdgeCount === 0 ? (
            <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2">
              <div className="rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
                No cross-folder dependencies found. Showing folder nodes only.
              </div>
            </div>
          ) : null}
          {mode === "structure" || mode === "focus" ? (
            <div className="absolute right-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-2 rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
              {mode === "structure" ? (
                <span className="flex items-center gap-1.5">
                  <FolderTree className="size-3.5" />
                  External badges = outside this folder
                </span>
              ) : null}
              <span>
                Direction:{" "}
                <span className="font-medium text-foreground">
                  importing file
                </span>{" "}
                →{" "}
                <span className="font-medium text-foreground">
                  imported file
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-5 rounded-full bg-sky-400" />
                selected → imports
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-5 rounded-full border-t-2 border-dashed border-orange-400" />
                used by → selected
              </span>
              {relationMode === "blast-radius" ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-5 rounded-full bg-fuchsia-400" />
                  blast radius
                </span>
              ) : null}
            </div>
          ) : null}
          {mode === "focus" ? (
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
              <span>
                <span className="font-medium text-foreground">Left:</span> used
                by / importers
              </span>
              <span className="text-muted-foreground/50">|</span>
              <span>
                <span className="font-medium text-foreground">Center:</span>{" "}
                selected file
              </span>
              <span className="text-muted-foreground/50">|</span>
              <span>
                <span className="font-medium text-foreground">Right:</span>{" "}
                imports / dependencies
              </span>
            </div>
          ) : null}
          <GraphCanvas
            nodes={activeLayout.nodes}
            edges={activeLayout.edges}
            cycleNodeIds={activeCycleNodeIds}
            selectedNodeId={selectedNodeId}
            highlightedNodeIds={highlightedNodeIds}
            activeRelationMode={relationMode}
            projectId={projectId}
            enableFocusLayout={mode !== "structure" || !selectedNodeId}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onOpenDrawer={onOpenDrawer}
            onCopyPath={onCopyPath}
            onExpandCluster={onExpandCluster}
          />
        </>
      ) : null}
    </div>
  );
}
