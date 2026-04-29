"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
} from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useViewport,
  useReactFlow,
  useNodesInitialized,
  MarkerType,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import { edgeTypes, type DependencyEdgeData } from "./graph-edge";
import { nodeTypes } from "./graph-node";
import type {
  ProjectMapGraphFolderNode,
  ProjectMapGraphNode,
} from "@/features/projects/api";
import {
  relayoutFocusGraph,
  type GraphRelationMode,
} from "../utils/graph-layout";

const EDGE_COLORS = {
  outgoing: "rgb(56 189 248 / 0.82)",
  incoming: "rgb(251 146 60 / 0.82)",
  related: "rgb(148 163 184 / 0.5)",
  cycle: "rgb(239 68 68 / 0.76)",
  blast: "rgb(217 70 239 / 0.82)",
  muted: "rgb(148 163 184 / 0.07)",
  mutedCycle: "rgb(239 68 68 / 0.1)",
};

export interface ReactFlowWrapperProps {
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
  activeRelationMode: GraphRelationMode;
  projectId: string;
  enableFocusLayout: boolean;
  isLayoutReady: boolean;
  nodesKey: string;
  effectiveActiveNodeIds: Set<string> | null;
  edgeCurveOffsets: Map<string, number>;
  zoom: number;
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onOpenDrawer: (nodeId: string) => void;
  onCopyPath: (path: string) => void;
  onExpandCluster?: (clusterId: string) => void;
  onZoom: (zoom: number) => void;
  onLayoutReady: () => void;
  onHoverChange: (nodeId: string | null) => void;
}

function ZoomSync({ onZoom }: { onZoom: (zoom: number) => void }) {
  const { zoom } = useViewport();
  useEffect(() => {
    onZoom(zoom);
  }, [zoom, onZoom]);
  return null;
}

function FitViewSync({
  fitRef,
}: {
  fitRef: React.MutableRefObject<(() => void) | null>;
}) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    fitRef.current = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fitView({ duration: 350, padding: 0.2 });
        });
      });
    };
  }, [fitView, fitRef]);
  return null;
}

function ClusterRelayout({
  edges,
  relationMode,
  nodesKey,
  onReady,
}: {
  edges: Edge[];
  relationMode: GraphRelationMode;
  nodesKey: string;
  onReady: () => void;
}) {
  const { getNodes, setNodes, fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  const lastRelayoutKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialized) return;
    if (lastRelayoutKeyRef.current === nodesKey) return;

    const current = getNodes();
    const hasCluster = current.some((node) => node.type === "clusterNode");

    if (!hasCluster) {
      lastRelayoutKeyRef.current = nodesKey;
      onReady();
      return;
    }

    let cancelled = false;
    const sizedNodes = current.map((node) => ({
      id: node.id,
      width: node.width ?? 240,
      height: node.height ?? 72,
    }));
    const flatEdges = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    }));

    relayoutFocusGraph({ nodes: sizedNodes, edges: flatEdges, relationMode })
      .then((posMap) => {
        if (cancelled) return;
        setNodes((currentNodes) =>
          currentNodes.map((node) => ({
            ...node,
            position: posMap.get(node.id) ?? node.position,
          })),
        );
        lastRelayoutKeyRef.current = nodesKey;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fitView({ duration: 250, padding: 0.2 });
            onReady();
          });
        });
      })
      .catch(() => {
        if (cancelled) return;
        lastRelayoutKeyRef.current = nodesKey;
        onReady();
      });

    return () => {
      cancelled = true;
    };
  }, [initialized, nodesKey, edges, relationMode, getNodes, setNodes, fitView, onReady]);

  return null;
}

export function ReactFlowWrapper({
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
  onZoom,
  onLayoutReady,
  onHoverChange,
}: ReactFlowWrapperProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const fitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (enableFocusLayout) {
      fitRef.current?.();
    }
  }, [initialNodes, initialEdges, enableFocusLayout]);

  useEffect(() => {
    setNodes(
      initialNodes.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
        style: {
          ...n.style,
          opacity:
            effectiveActiveNodeIds && !effectiveActiveNodeIds.has(n.id)
              ? 0.22
              : 1,
          transition: "opacity 0.15s ease",
        },
        data: {
          ...n.data,
          zoom,
          projectId,
          onOpenDrawer,
          onCopyPath,
          onExpand: onExpandCluster,
        },
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setNodes((currentNodes: Node[]) =>
      currentNodes.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
        style: {
          ...n.style,
          opacity:
            effectiveActiveNodeIds && !effectiveActiveNodeIds.has(n.id)
              ? 0.22
              : 1,
          transition: "opacity 0.15s ease",
        },
        data: {
          ...n.data,
          zoom,
          projectId,
          onOpenDrawer,
          onCopyPath,
          onExpand: onExpandCluster,
        },
      })),
    );
  }, [
    effectiveActiveNodeIds,
    selectedNodeId,
    zoom,
    projectId,
    onOpenDrawer,
    onCopyPath,
    onExpandCluster,
    setNodes,
  ]);

  useEffect(() => {
    setEdges(
      initialEdges.map((e) => {
        const isCycle =
          cycleNodeIds.has(e.source) && cycleNodeIds.has(e.target);
        const relationAnchorId = selectedNodeId;
        const isOutgoingFromAnchor = Boolean(
          relationAnchorId && e.source === relationAnchorId,
        );
        const isIncomingToAnchor = Boolean(
          relationAnchorId && e.target === relationAnchorId,
        );
        const isActive =
          effectiveActiveNodeIds === null ||
          (effectiveActiveNodeIds.has(e.source) &&
            effectiveActiveNodeIds.has(e.target)) ||
          e.source === selectedNodeId ||
          e.target === selectedNodeId;
        const stroke = isActive
          ? activeRelationMode === "blast-radius"
            ? EDGE_COLORS.blast
            : isCycle
              ? EDGE_COLORS.cycle
              : isOutgoingFromAnchor
                ? EDGE_COLORS.outgoing
                : isIncomingToAnchor
                  ? EDGE_COLORS.incoming
                  : EDGE_COLORS.related
          : isCycle
            ? EDGE_COLORS.mutedCycle
            : EDGE_COLORS.muted;
        const strokeWidth =
          activeRelationMode === "blast-radius" ||
          isCycle ||
          isOutgoingFromAnchor ||
          isIncomingToAnchor
            ? 2.2
            : 1.15;
        const relationLabel =
          activeRelationMode === "blast-radius" && isIncomingToAnchor
            ? "direct impact"
            : isOutgoingFromAnchor
              ? "imports"
              : isIncomingToAnchor
                ? "imports this"
                : undefined;

        return {
          ...e,
          type: "dependency",
          data: {
            ...(e.data as DependencyEdgeData | undefined),
            relationLabel,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: stroke,
          },
          style: {
            stroke,
            strokeWidth,
            strokeDasharray:
              activeRelationMode !== "blast-radius" && isIncomingToAnchor
                ? "7 6"
                : undefined,
            transition: "stroke 0.15s ease",
          },
        };
      }),
    );
  }, [
    effectiveActiveNodeIds,
    activeRelationMode,
    edgeCurveOffsets,
    initialEdges,
    cycleNodeIds,
    selectedNodeId,
    setEdges,
  ]);

  const handleNodeMouseEnter: NodeMouseHandler = useCallback(
    (_e, node) => onHoverChange(node.id),
    [onHoverChange],
  );
  const handleNodeMouseLeave: NodeMouseHandler = useCallback(
    () => onHoverChange(null),
    [onHoverChange],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onlyRenderVisibleElements={true}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(
        _event: React.MouseEvent,
        node: Node<ProjectMapGraphNode>,
      ) => onNodeClick(node.id)}
      onNodeDoubleClick={(
        _event: React.MouseEvent,
        node: Node<ProjectMapGraphNode>,
      ) => onNodeDoubleClick?.(node.id)}
      onPaneClick={() => onNodeClick("")}
      onNodeMouseEnter={handleNodeMouseEnter}
      onNodeMouseLeave={handleNodeMouseLeave}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.05}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      selectNodesOnDrag={false}
      style={{
        opacity: isLayoutReady ? 1 : 0,
        transition: "opacity 180ms ease",
      }}
    >
      <ZoomSync onZoom={onZoom} />
      <FitViewSync fitRef={fitRef} />
      <ClusterRelayout
        edges={edges}
        relationMode={activeRelationMode}
        nodesKey={nodesKey}
        onReady={onLayoutReady}
      />
      <Background gap={20} size={1} color="rgb(148 163 184 / 0.15)" />
      <Controls showInteractive={false} />
      <MiniMap
        nodeColor={(node: { id: string }) =>
          cycleNodeIds.has(node.id)
            ? "rgb(239 68 68 / 0.7)"
            : "rgb(148 163 184 / 0.5)"
        }
        maskColor="rgb(0 0 0 / 0.04)"
        pannable
        zoomable
      />
    </ReactFlow>
  );
}
