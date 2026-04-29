"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Edge, Node } from "reactflow";
import type {
  ProjectMapGraphFolderNode,
  ProjectMapGraphNode,
} from "@/features/projects/api";
import type { GraphRelationMode } from "../utils/graph-layout";
import type { ReactFlowWrapperProps } from "./react-flow-wrapper";

const ReactFlowWrapper = dynamic(
  () =>
    import("./react-flow-wrapper").then((m) => ({ default: m.ReactFlowWrapper })),
  { ssr: false },
);

interface GraphCanvasProps {
  nodes: Node<
    | ((ProjectMapGraphNode | ProjectMapGraphFolderNode) & {
        isInCycle?: boolean;
      })
    | {
        kind: "cluster";
        direction: "incoming" | "outgoing";
        focusId: string;
        nodeIds: string[];
        count: number;
        sample: string[];
      }
  >[];
  edges: Edge[];
  cycleNodeIds: Set<string>;
  selectedNodeId: string | null;
  highlightedNodeIds?: Set<string>;
  activeRelationMode?: GraphRelationMode;
  projectId: string;
  enableFocusLayout?: boolean;
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onOpenDrawer: (nodeId: string) => void;
  onCopyPath: (path: string) => void;
  onExpandCluster?: (clusterId: string) => void;
}

export function GraphCanvas({
  nodes: initialNodes,
  edges: initialEdges,
  cycleNodeIds,
  selectedNodeId,
  highlightedNodeIds,
  activeRelationMode = "all",
  projectId,
  enableFocusLayout = true,
  onNodeClick,
  onNodeDoubleClick,
  onOpenDrawer,
  onCopyPath,
  onExpandCluster,
}: GraphCanvasProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const nodesKey = useMemo(
    () => initialNodes.map((node) => node.id).join("|"),
    [initialNodes],
  );
  const hasClusterInitial = useMemo(
    () => initialNodes.some((node) => node.type === "clusterNode"),
    [initialNodes],
  );
  const [isLayoutReady, setIsLayoutReady] = useState(!hasClusterInitial);
  useEffect(() => {
    setIsLayoutReady(!hasClusterInitial);
  }, [nodesKey, hasClusterInitial]);
  const handleLayoutReady = useCallback(() => setIsLayoutReady(true), []);

  const edgeCurveOffsets = useMemo(() => {
    const outgoingGroups = new Map<string, Edge[]>();
    for (const edge of initialEdges) {
      const group = outgoingGroups.get(edge.source) ?? [];
      group.push(edge);
      outgoingGroups.set(edge.source, group);
    }
    const offsets = new Map<string, number>();
    for (const group of outgoingGroups.values()) {
      const sortedGroup = [...group].sort((a, b) => {
        const targetSort = a.target.localeCompare(b.target);
        return targetSort === 0 ? a.id.localeCompare(b.id) : targetSort;
      });
      const spread = sortedGroup.length > 4 ? 12 : 18;
      const maxOffset = 54;
      sortedGroup.forEach((edge, index) => {
        const centeredIndex = index - (sortedGroup.length - 1) / 2;
        offsets.set(
          edge.id,
          Math.max(Math.min(centeredIndex * spread, maxOffset), -maxOffset),
        );
      });
    }
    return offsets;
  }, [initialEdges]);

  const activeNodeIds = useMemo(() => {
    if (selectedNodeId) return highlightedNodeIds ?? new Set<string>([selectedNodeId]);
    if (hoveredNodeId) return new Set<string>([hoveredNodeId]);
    return null;
  }, [highlightedNodeIds, hoveredNodeId, selectedNodeId]);

  const effectiveActiveNodeIds = useMemo(() => {
    if (!activeNodeIds) return null;
    const result = new Set(activeNodeIds);
    for (const node of initialNodes) {
      if (node.type !== "clusterNode") continue;
      const clusterNodeIds = (node.data as { nodeIds?: string[] } | undefined)?.nodeIds;
      if (clusterNodeIds?.some((id) => activeNodeIds.has(id))) result.add(node.id);
    }
    return result;
  }, [activeNodeIds, initialNodes]);

  const wrapperProps: ReactFlowWrapperProps = {
    nodes: initialNodes,
    edges: initialEdges,
    cycleNodeIds,
    selectedNodeId,
    highlightedNodeIds,
    activeRelationMode,
    projectId,
    enableFocusLayout,
    isLayoutReady,
    nodesKey,
    effectiveActiveNodeIds,
    edgeCurveOffsets,
    zoom,
    onNodeClick,
    onNodeDoubleClick,
    onOpenDrawer,
    onCopyPath,
    onExpandCluster,
    onZoom: setZoom,
    onLayoutReady: handleLayoutReady,
    onHoverChange: setHoveredNodeId,
  };

  return <ReactFlowWrapper {...wrapperProps} />;
}
