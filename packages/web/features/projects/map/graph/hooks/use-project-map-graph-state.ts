"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { ProjectMapGraphResponse } from "@/features/projects/api";
import {
  findGraphNodeById,
  findGraphNodeByPath,
  getBlastRadiusSummary,
  getParentFolder,
  type GraphMode,
} from "../project-map-graph-shared";
import type { GraphRelationMode } from "../utils/graph-layout";

interface GraphViewState {
  mode: GraphMode;
  selectedFolder: string | null;
  focusedNodeId: string | null;
  selectedNodeId: string | null;
  relationMode: GraphRelationMode;
  drawerNodeId: string | null;
  expandedClusters: Set<string>;
}

type GraphViewAction =
  | { type: "ENTER_OVERVIEW" }
  | { type: "ENTER_STRUCTURE"; folder: string }
  | { type: "ENTER_FOCUS"; nodeId: string; relationMode: GraphRelationMode }
  | { type: "TOGGLE_SELECTED_NODE"; nodeId: string }
  | { type: "CLEAR_SELECTED_NODE" }
  | { type: "OPEN_DRAWER"; nodeId: string }
  | { type: "CLOSE_DRAWER" }
  | { type: "EXPAND_CLUSTER"; clusterId: string };

function createInitialState(
  graphData: ProjectMapGraphResponse,
  initialFocusFile?: string | null,
): GraphViewState {
  const initialFocusNode = findGraphNodeByPath(graphData.nodes, initialFocusFile);

  return {
    mode: initialFocusNode ? "focus" : "overview",
    selectedFolder: null,
    focusedNodeId: initialFocusNode?.id ?? null,
    selectedNodeId: initialFocusNode?.id ?? null,
    relationMode: "all",
    drawerNodeId: initialFocusNode?.id ?? null,
    expandedClusters: new Set(),
  };
}

function graphViewReducer(
  state: GraphViewState,
  action: GraphViewAction,
): GraphViewState {
  switch (action.type) {
    case "ENTER_OVERVIEW":
      return {
        mode: "overview",
        selectedFolder: null,
        focusedNodeId: null,
        selectedNodeId: null,
        relationMode: "all",
        drawerNodeId: null,
        expandedClusters: new Set(),
      };
    case "ENTER_STRUCTURE":
      return {
        mode: "structure",
        selectedFolder: action.folder,
        focusedNodeId: null,
        selectedNodeId: null,
        relationMode: "all",
        drawerNodeId: null,
        expandedClusters: new Set(),
      };
    case "ENTER_FOCUS":
      return {
        mode: "focus",
        selectedFolder: state.selectedFolder,
        focusedNodeId: action.nodeId,
        selectedNodeId: action.nodeId,
        relationMode: action.relationMode,
        drawerNodeId: null,
        expandedClusters: new Set(),
      };
    case "TOGGLE_SELECTED_NODE":
      return {
        ...state,
        selectedNodeId:
          state.selectedNodeId === action.nodeId ? null : action.nodeId,
      };
    case "CLEAR_SELECTED_NODE":
      return {
        ...state,
        selectedNodeId: null,
      };
    case "OPEN_DRAWER":
      return {
        ...state,
        drawerNodeId: action.nodeId,
      };
    case "CLOSE_DRAWER":
      return {
        ...state,
        drawerNodeId: null,
      };
    case "EXPAND_CLUSTER": {
      if (state.expandedClusters.has(action.clusterId)) {
        return state;
      }

      const next = new Set(state.expandedClusters);
      next.add(action.clusterId);

      return {
        ...state,
        expandedClusters: next,
      };
    }
    default:
      return state;
  }
}

export function useProjectMapGraphState({
  graphData,
  initialFocusFile,
}: {
  graphData: ProjectMapGraphResponse;
  initialFocusFile?: string | null;
}) {
  const [state, dispatch] = useReducer(
    graphViewReducer,
    { graphData, initialFocusFile },
    ({ graphData: initialGraphData, initialFocusFile: initialFile }) =>
      createInitialState(initialGraphData, initialFile),
  );
  const lastAppliedInitialFocusFileRef = useRef<string | null>(
    initialFocusFile ?? null,
  );

  useEffect(() => {
    const nextFocusFile = initialFocusFile ?? null;

    if (!nextFocusFile) {
      lastAppliedInitialFocusFileRef.current = null;
      return;
    }

    if (lastAppliedInitialFocusFileRef.current === nextFocusFile) {
      return;
    }

    const node = findGraphNodeByPath(graphData.nodes, nextFocusFile);

    if (!node) {
      lastAppliedInitialFocusFileRef.current = nextFocusFile;
      return;
    }

    lastAppliedInitialFocusFileRef.current = nextFocusFile;
    dispatch({ type: "ENTER_FOCUS", nodeId: node.id, relationMode: "all" });
    dispatch({ type: "OPEN_DRAWER", nodeId: node.id });
  }, [graphData.nodes, initialFocusFile]);

  const allCycleNodeIds = useMemo(
    () => new Set(graphData.cycles.flatMap((cycle) => cycle.nodeIds)),
    [graphData.cycles],
  );
  const drawerNode = useMemo(
    () => findGraphNodeById(graphData.nodes, state.drawerNodeId),
    [graphData.nodes, state.drawerNodeId],
  );
  const drawerCycles = useMemo(() => {
    const drawerNodeId = state.drawerNodeId;

    if (!drawerNodeId) return [];

    return graphData.cycles.filter((cycle) =>
      cycle.nodeIds.includes(drawerNodeId),
    );
  }, [graphData.cycles, state.drawerNodeId]);
  const focusedNode = useMemo(
    () => findGraphNodeById(graphData.nodes, state.focusedNodeId),
    [graphData.nodes, state.focusedNodeId],
  );
  const selectedNode = useMemo(
    () => findGraphNodeById(graphData.nodes, state.selectedNodeId),
    [graphData.nodes, state.selectedNodeId],
  );
  const selectedBlastRadius = useMemo(
    () => getBlastRadiusSummary(graphData, state.selectedNodeId),
    [graphData, state.selectedNodeId],
  );
  const highlightedNodeIds = useMemo(() => {
    if (!state.selectedNodeId) return undefined;

    const relatedIds = new Set<string>([state.selectedNodeId]);
    const blastRadiusSummary = getBlastRadiusSummary(
      graphData,
      state.selectedNodeId,
    );
    const selectedCycleIds = new Set(
      graphData.cycles
        .filter((cycle) => cycle.nodeIds.includes(state.selectedNodeId!))
        .flatMap((cycle) => cycle.nodeIds),
    );

    if (state.relationMode === "cycles") {
      for (const nodeId of selectedCycleIds) {
        relatedIds.add(nodeId);
      }
      return relatedIds;
    }

    if (state.relationMode === "blast-radius") {
      for (const nodeId of blastRadiusSummary?.impactedIds ?? []) {
        relatedIds.add(nodeId);
      }
      return relatedIds;
    }

    for (const edge of graphData.edges) {
      if (
        (state.relationMode === "all" || state.relationMode === "outgoing") &&
        edge.source === state.selectedNodeId
      ) {
        relatedIds.add(edge.target);
      }

      if (
        (state.relationMode === "all" || state.relationMode === "incoming") &&
        edge.target === state.selectedNodeId
      ) {
        relatedIds.add(edge.source);
      }
    }

    return relatedIds;
  }, [graphData, state.relationMode, state.selectedNodeId]);
  const selectedNodeCycles = useMemo(
    () =>
      state.selectedNodeId
        ? graphData.cycles.filter((cycle) =>
            cycle.nodeIds.includes(state.selectedNodeId!),
          )
        : [],
    [graphData.cycles, state.selectedNodeId],
  );
  const activeCycleNodeIds = useMemo(
    () => (state.mode === "overview" ? new Set<string>() : allCycleNodeIds),
    [allCycleNodeIds, state.mode],
  );

  const enterStructure = useCallback((folder: string) => {
    dispatch({ type: "ENTER_STRUCTURE", folder });
  }, []);

  const enterFocus = useCallback(
    (nodeId: string, relationMode: GraphRelationMode = state.relationMode) => {
      dispatch({ type: "ENTER_FOCUS", nodeId, relationMode });
    },
    [state.relationMode],
  );

  const backToOverview = useCallback(() => {
    dispatch({ type: "ENTER_OVERVIEW" });
  }, []);

  const backOneLevel = useCallback(() => {
    const parentFolder = getParentFolder(state.selectedFolder);

    if (!parentFolder) {
      dispatch({ type: "ENTER_OVERVIEW" });
      return;
    }

    dispatch({ type: "ENTER_STRUCTURE", folder: parentFolder });
  }, [state.selectedFolder]);

  const backToStructure = useCallback(() => {
    if (focusedNode?.dirPath) {
      dispatch({ type: "ENTER_STRUCTURE", folder: focusedNode.dirPath });
      return;
    }

    dispatch({ type: "ENTER_OVERVIEW" });
  }, [focusedNode?.dirPath]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (nodeId === "") {
        dispatch({ type: "CLEAR_SELECTED_NODE" });
        return;
      }

      if (state.mode === "overview") {
        const folderNode = graphData.folderNodes.find((node) => node.id === nodeId);
        if (folderNode) {
          dispatch({ type: "ENTER_STRUCTURE", folder: folderNode.folder });
        }
        return;
      }

      if (state.mode === "structure") {
        if (nodeId.startsWith("structure-folder:")) {
          dispatch({
            type: "ENTER_STRUCTURE",
            folder: nodeId.replace("structure-folder:", ""),
          });
          return;
        }

        if (graphData.nodes.some((node) => node.id === nodeId)) {
          dispatch({ type: "TOGGLE_SELECTED_NODE", nodeId });
        }
        return;
      }

      if (
        state.mode === "focus" &&
        graphData.nodes.some((node) => node.id === nodeId)
      ) {
        dispatch({ type: "TOGGLE_SELECTED_NODE", nodeId });
      }
    },
    [graphData.folderNodes, graphData.nodes, state.mode],
  );

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      if (graphData.nodes.some((node) => node.id === nodeId)) {
        dispatch({ type: "ENTER_FOCUS", nodeId, relationMode: "all" });
      }
    },
    [graphData.nodes],
  );

  const handleOpenDrawer = useCallback((nodeId: string) => {
    dispatch({ type: "OPEN_DRAWER", nodeId });
  }, []);

  const handleCloseDrawer = useCallback(() => {
    dispatch({ type: "CLOSE_DRAWER" });
  }, []);

  const handleExpandCluster = useCallback((clusterId: string) => {
    dispatch({ type: "EXPAND_CLUSTER", clusterId });
  }, []);

  const handleSelectByPath = useCallback(
    (path: string) => {
      const node = findGraphNodeByPath(graphData.nodes, path);

      if (!node) return;

      dispatch({ type: "ENTER_FOCUS", nodeId: node.id, relationMode: "all" });
      dispatch({ type: "OPEN_DRAWER", nodeId: node.id });
    },
    [graphData.nodes],
  );

  const handleFocusSelectedNode = useCallback(
    (nextRelationMode: GraphRelationMode = state.relationMode) => {
      if (!state.selectedNodeId) return;
      dispatch({
        type: "ENTER_FOCUS",
        nodeId: state.selectedNodeId,
        relationMode: nextRelationMode,
      });
    },
    [state.relationMode, state.selectedNodeId],
  );

  const handleRelationModeChange = useCallback(
    (nextRelationMode: GraphRelationMode) => {
      if (state.selectedNodeId) {
        dispatch({
          type: "ENTER_FOCUS",
          nodeId: state.selectedNodeId,
          relationMode: nextRelationMode,
        });
      }
    },
    [state.selectedNodeId],
  );

  return {
    state,
    derived: {
      allCycleNodeIds,
      activeCycleNodeIds,
      drawerNode,
      drawerCycles,
      focusedNode,
      selectedNode,
      selectedBlastRadius,
      highlightedNodeIds,
      selectedNodeCycles,
    },
    actions: {
      enterStructure,
      enterFocus,
      backToOverview,
      backOneLevel,
      backToStructure,
      handleNodeClick,
      handleNodeDoubleClick,
      handleOpenDrawer,
      handleCloseDrawer,
      handleExpandCluster,
      handleSelectByPath,
      handleFocusSelectedNode,
      handleRelationModeChange,
    },
  };
}
