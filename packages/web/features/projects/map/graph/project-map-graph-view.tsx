"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ProjectMapGraphNode,
  ProjectMapGraphResponse,
} from "@/features/projects/api";
import {
  buildFileFocusGraphLayout,
  buildFolderGraphLayout,
  buildFolderStructureLayout,
  type FolderGraphLayoutResult,
  type FolderStructureLayoutResult,
  type GraphLayoutResult,
  type GraphRelationMode,
} from "./utils/graph-layout";
import { GraphNodeDrawer } from "./components/graph-node-drawer";
import { ProjectMapGraphCanvasShell } from "./project-map-graph-canvas-shell";
import { ProjectMapGraphSidebar } from "./project-map-graph-sidebar";
import {
  findGraphNodeById,
  findGraphNodeByPath,
  getBlastRadiusSummary,
  getFolderBreadcrumb,
  getParentFolder,
  type GraphMode,
} from "./project-map-graph-shared";

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
  const initialFocusNode = findGraphNodeByPath(graphData.nodes, initialFocusFile);

  const [mode, setMode] = useState<GraphMode>(initialFocusNode ? "focus" : "overview");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(initialFocusNode?.id ?? null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialFocusNode?.id ?? null);
  const [relationMode, setRelationMode] = useState<GraphRelationMode>("all");
  const [drawerNodeId, setDrawerNodeId] = useState<string | null>(initialFocusNode?.id ?? null);
  const [folderLayout, setFolderLayout] =
    useState<FolderGraphLayoutResult | null>(null);
  const [structureLayout, setStructureLayout] =
    useState<FolderStructureLayoutResult | null>(null);
  const [focusLayout, setFocusLayout] = useState<GraphLayoutResult | null>(
    null,
  );
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(
    () => new Set(),
  );
  const [isLayouting, setIsLayouting] = useState(false);
  const layoutRunRef = useRef(0);
  useEffect(() => {
    const run = ++layoutRunRef.current;
    setIsLayouting(true);

    if (mode === "overview") {
      buildFolderGraphLayout(graphData).then((result) => {
        if (run !== layoutRunRef.current) return;
        setFolderLayout(result);
        setStructureLayout(null);
        setFocusLayout(null);
        setIsLayouting(false);
      });
      return;
    }

    if (mode === "structure" && selectedFolder) {
      buildFolderStructureLayout(graphData, selectedFolder).then((result) => {
        if (run !== layoutRunRef.current) return;
        setStructureLayout(result);
        setFolderLayout(null);
        setFocusLayout(null);
        setIsLayouting(false);
      });
      return;
    }

    if (mode === "focus" && focusedNodeId) {
      buildFileFocusGraphLayout(
        graphData,
        focusedNodeId,
        relationMode,
        expandedClusters,
      ).then((result) => {
        if (run !== layoutRunRef.current) return;
        setFocusLayout(result);
        setFolderLayout(null);
        setStructureLayout(null);
        setIsLayouting(false);
      });
      return;
    }

    setIsLayouting(false);
  }, [
    expandedClusters,
    focusedNodeId,
    graphData,
    mode,
    relationMode,
    selectedFolder,
  ]);

  const allCycleNodeIds = useMemo(
    () => new Set(graphData.cycles.flatMap((cycle) => cycle.nodeIds)),
    [graphData.cycles],
  );

  const drawerNode: ProjectMapGraphNode | null = useMemo(
    () => findGraphNodeById(graphData.nodes, drawerNodeId),
    [drawerNodeId, graphData.nodes],
  );
  const drawerCycles = useMemo(() => {
    if (!drawerNodeId) return [];
    return graphData.cycles.filter((cycle) =>
      cycle.nodeIds.includes(drawerNodeId),
    );
  }, [drawerNodeId, graphData.cycles]);

  const focusedNode = useMemo(
    () => findGraphNodeById(graphData.nodes, focusedNodeId),
    [focusedNodeId, graphData.nodes],
  );
  const selectedNode = useMemo(
    () => findGraphNodeById(graphData.nodes, selectedNodeId),
    [selectedNodeId, graphData.nodes],
  );
  const selectedBlastRadius = useMemo(
    () => getBlastRadiusSummary(graphData, selectedNodeId),
    [graphData, selectedNodeId],
  );
  const highlightedNodeIds = useMemo(() => {
    if (!selectedNodeId) return undefined;

    const relatedIds = new Set<string>([selectedNodeId]);
    const blastRadiusSummary = getBlastRadiusSummary(graphData, selectedNodeId);
    const selectedCycleIds = new Set(
      graphData.cycles
        .filter((cycle) => cycle.nodeIds.includes(selectedNodeId))
        .flatMap((cycle) => cycle.nodeIds),
    );

    if (relationMode === "cycles") {
      for (const nodeId of selectedCycleIds) {
        relatedIds.add(nodeId);
      }

      return relatedIds;
    }

    if (relationMode === "blast-radius") {
      for (const nodeId of blastRadiusSummary?.impactedIds ?? []) {
        relatedIds.add(nodeId);
      }

      return relatedIds;
    }

    for (const edge of graphData.edges) {
      if (
        (relationMode === "all" || relationMode === "outgoing") &&
        edge.source === selectedNodeId
      ) {
        relatedIds.add(edge.target);
      }

      if (
        (relationMode === "all" || relationMode === "incoming") &&
        edge.target === selectedNodeId
      ) {
        relatedIds.add(edge.source);
      }
    }

    return relatedIds;
  }, [graphData, relationMode, selectedNodeId]);

  const enterStructure = (folder: string) => {
    setMode("structure");
    setSelectedFolder(folder);
    setFocusedNodeId(null);
    setSelectedNodeId(null);
    setRelationMode("all");
    setDrawerNodeId(null);
    setExpandedClusters(new Set());
  };

  const enterFocus = (nodeId: string, nextRelationMode = relationMode) => {
    setMode("focus");
    setFocusedNodeId(nodeId);
    setSelectedNodeId(nodeId);
    setRelationMode(nextRelationMode);
    setDrawerNodeId(null);
    setExpandedClusters(new Set());
  };

  const backToOverview = () => {
    setMode("overview");
    setSelectedFolder(null);
    setFocusedNodeId(null);
    setSelectedNodeId(null);
    setRelationMode("all");
    setDrawerNodeId(null);
    setExpandedClusters(new Set());
  };

  const backOneLevel = () => {
    const parentFolder = getParentFolder(selectedFolder);

    if (!parentFolder) {
      backToOverview();
      return;
    }

    enterStructure(parentFolder);
  };

  const backToStructure = () => {
    if (focusedNode?.dirPath) {
      enterStructure(focusedNode.dirPath);
      return;
    }

    backToOverview();
  };

  const handleNodeClick = (nodeId: string) => {
    if (nodeId === "") {
      setSelectedNodeId(null);
      return;
    }

    if (mode === "overview") {
      const folderNode = graphData.folderNodes.find(
        (node) => node.id === nodeId,
      );

      if (folderNode) {
        enterStructure(folderNode.folder);
      }

      return;
    }

    if (mode === "structure") {
      if (nodeId.startsWith("structure-folder:")) {
        enterStructure(nodeId.replace("structure-folder:", ""));
        return;
      }

      if (graphData.nodes.some((node) => node.id === nodeId)) {
        setSelectedNodeId((previousNodeId) =>
          previousNodeId === nodeId ? null : nodeId,
        );
      }

      return;
    }

    if (
      mode === "focus" &&
      graphData.nodes.some((node) => node.id === nodeId)
    ) {
      setSelectedNodeId((previousNodeId) =>
        previousNodeId === nodeId ? null : nodeId,
      );
    }
  };

  const handleNodeDoubleClick = (nodeId: string) => {
    if (graphData.nodes.some((node) => node.id === nodeId)) {
      enterFocus(nodeId, "all");
    }
  };

  const handleOpenDrawer = useCallback((nodeId: string) => {
    setDrawerNodeId(nodeId);
  }, []);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
  }, []);

  const handleExpandCluster = useCallback((clusterId: string) => {
    setExpandedClusters((previous) => {
      if (previous.has(clusterId)) return previous;
      const next = new Set(previous);
      next.add(clusterId);
      return next;
    });
  }, []);

  const handleSelectByPath = (path: string) => {
    const node = findGraphNodeByPath(graphData.nodes, path);

    if (node) {
      setMode("focus");
      setFocusedNodeId(node.id);
      setRelationMode("all");
      setDrawerNodeId(node.id);
      setSelectedNodeId(node.id);
      setExpandedClusters(new Set());
    }
  };

  const handleFocusSelectedNode = (
    nextRelationMode: GraphRelationMode = relationMode,
  ) => {
    if (!selectedNodeId) return;
    enterFocus(selectedNodeId, nextRelationMode);
  };

  const handleRelationModeChange = (nextRelationMode: GraphRelationMode) => {
    setRelationMode(nextRelationMode);
    setExpandedClusters(new Set());

    if (selectedNodeId) {
      enterFocus(selectedNodeId, nextRelationMode);
    }
  };

  const activeLayout =
    mode === "overview"
      ? folderLayout
      : mode === "structure"
        ? structureLayout
        : focusLayout;
  const activeCycleNodeIds =
    mode === "overview" ? new Set<string>() : allCycleNodeIds;
  const breadcrumb = getFolderBreadcrumb(selectedFolder);
  const selectedNodeCycles = selectedNodeId
    ? graphData.cycles.filter((cycle) => cycle.nodeIds.includes(selectedNodeId))
    : [];

  return (
    <>
      <div className="flex gap-4" style={{ height: "calc(100vh - 280px)" }}>
        <ProjectMapGraphSidebar
          projectId={projectId}
          mode={mode}
          graphData={graphData}
          breadcrumb={breadcrumb}
          structureLayout={structureLayout}
          focusLayout={focusLayout}
          selectedFolder={selectedFolder}
          focusedNode={focusedNode}
          selectedNode={selectedNode}
          selectedBlastRadius={selectedBlastRadius}
          selectedNodeCycles={selectedNodeCycles}
          allCycleNodeIds={allCycleNodeIds}
          relationMode={relationMode}
          onBackOneLevel={backOneLevel}
          onBackToOverview={backToOverview}
          onBackToStructure={backToStructure}
          onRelationModeChange={handleRelationModeChange}
          onFocusSelectedNode={handleFocusSelectedNode}
          onOpenDrawer={handleOpenDrawer}
          onCopyPath={handleCopyPath}
        />

        <ProjectMapGraphCanvasShell
          mode={mode}
          graphData={graphData}
          activeLayout={activeLayout}
          activeCycleNodeIds={activeCycleNodeIds}
          selectedNodeId={selectedNodeId}
          highlightedNodeIds={highlightedNodeIds}
          relationMode={relationMode}
          projectId={projectId}
          isLayouting={isLayouting}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onOpenDrawer={handleOpenDrawer}
          onCopyPath={handleCopyPath}
          onExpandCluster={handleExpandCluster}
        />
      </div>

      <GraphNodeDrawer
        projectId={projectId}
        node={drawerNode}
        isInCycle={drawerNodeId ? allCycleNodeIds.has(drawerNodeId) : false}
        cycles={drawerCycles}
        graphNodes={graphData.nodes}
        graphEdges={graphData.edges}
        onClose={() => setDrawerNodeId(null)}
        onSelectByPath={handleSelectByPath}
      />
    </>
  );
}
