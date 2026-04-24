"use client";

import { useCallback, useMemo } from "react";
import type { ProjectMapGraphResponse } from "@/features/projects/api";
import { GraphNodeDrawer } from "./components/graph-node-drawer";
import { ProjectMapGraphCanvasShell } from "./project-map-graph-canvas-shell";
import { ProjectMapGraphSidebar } from "./project-map-graph-sidebar";
import { useProjectMapGraphLayout } from "./hooks/use-project-map-graph-layout";
import { useProjectMapGraphState } from "./hooks/use-project-map-graph-state";
import { getFolderBreadcrumb } from "./project-map-graph-shared";

interface ProjectMapGraphViewProps {
  projectId: string;
  graphData: ProjectMapGraphResponse;
  initialFocusFile?: string | null;
}

export function ProjectMapGraphView({
  projectId,
  graphData,
  initialFocusFile,
}: ProjectMapGraphViewProps) {
  const { state, derived, actions } = useProjectMapGraphState({
    graphData,
    initialFocusFile,
  });
  const { structureLayout, focusLayout, activeLayout, isLayouting } =
    useProjectMapGraphLayout({
      graphData,
      mode: state.mode,
      selectedFolder: state.selectedFolder,
      focusedNodeId: state.focusedNodeId,
      relationMode: state.relationMode,
      expandedClusters: state.expandedClusters,
    });

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
  }, []);

  const breadcrumb = useMemo(
    () => getFolderBreadcrumb(state.selectedFolder),
    [state.selectedFolder],
  );

  return (
    <>
      <div className="flex gap-4" style={{ height: "calc(100vh - 280px)" }}>
        <ProjectMapGraphSidebar
          projectId={projectId}
          mode={state.mode}
          graphData={graphData}
          breadcrumb={breadcrumb}
          structureLayout={structureLayout}
          focusLayout={focusLayout}
          selectedFolder={state.selectedFolder}
          focusedNode={derived.focusedNode}
          selectedNode={derived.selectedNode}
          selectedBlastRadius={derived.selectedBlastRadius}
          selectedNodeCycles={derived.selectedNodeCycles}
          allCycleNodeIds={derived.allCycleNodeIds}
          relationMode={state.relationMode}
          onBackOneLevel={actions.backOneLevel}
          onBackToOverview={actions.backToOverview}
          onBackToStructure={actions.backToStructure}
          onRelationModeChange={actions.handleRelationModeChange}
          onFocusSelectedNode={actions.handleFocusSelectedNode}
          onOpenDrawer={actions.handleOpenDrawer}
          onCopyPath={handleCopyPath}
        />

        <ProjectMapGraphCanvasShell
          mode={state.mode}
          graphData={graphData}
          activeLayout={activeLayout}
          activeCycleNodeIds={derived.activeCycleNodeIds}
          selectedNodeId={state.selectedNodeId}
          highlightedNodeIds={derived.highlightedNodeIds}
          relationMode={state.relationMode}
          projectId={projectId}
          isLayouting={isLayouting}
          onNodeClick={actions.handleNodeClick}
          onNodeDoubleClick={actions.handleNodeDoubleClick}
          onOpenDrawer={actions.handleOpenDrawer}
          onCopyPath={handleCopyPath}
          onExpandCluster={actions.handleExpandCluster}
        />
      </div>

      <GraphNodeDrawer
        projectId={projectId}
        node={derived.drawerNode}
        isInCycle={
          state.drawerNodeId
            ? derived.allCycleNodeIds.has(state.drawerNodeId)
            : false
        }
        cycles={derived.drawerCycles}
        graphNodes={graphData.nodes}
        graphEdges={graphData.edges}
        onClose={actions.handleCloseDrawer}
        onSelectByPath={actions.handleSelectByPath}
      />
    </>
  );
}
