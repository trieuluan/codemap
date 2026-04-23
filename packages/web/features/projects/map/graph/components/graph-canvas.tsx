"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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

// ── ZoomSync ────────────────────────────────────────────────────────────────

function ZoomSync({ onZoom }: { onZoom: (zoom: number) => void }) {
  const { zoom } = useViewport();
  useEffect(() => {
    onZoom(zoom);
  }, [zoom, onZoom]);
  return null;
}

// ── FitViewSync ──────────────────────────────────────────────────────────────
// Gọi fitView sau khi React Flow đã apply nodes mới vào internal store.
// Dùng double-rAF để đảm bảo React Flow đã measure xong node dimensions.

function FitViewSync({
  fitRef,
}: {
  fitRef: React.MutableRefObject<(() => void) | null>;
}) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    fitRef.current = () => {
      // double requestAnimationFrame: frame 1 = React commit, frame 2 = browser paint + RF measure
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fitView({ duration: 350, padding: 0.2 });
        });
      });
    };
  }, [fitView, fitRef]);
  return null;
}

// ── ClusterRelayout ──────────────────────────────────────────────────────────
// Two-pass auto-layout: pass 1 render nodes với position ước lượng (ELK lần 1
// với size tĩnh). Sau khi React Flow ResizeObserver đo size thật,
// useNodesInitialized() trả về true → chạy ELK lần 2 với width/height chính
// xác của từng node (đặc biệt quan trọng cho ClusterNode vốn có height động),
// rồi cập nhật position. Chỉ chạy khi graph có cluster node — các trường hợp
// khác báo ready ngay để tránh flash opacity.

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

    relayoutFocusGraph({
      nodes: sizedNodes,
      edges: flatEdges,
      relationMode,
    })
      .then((posMap) => {
        if (cancelled) return;
        setNodes((currentNodes) =>
          currentNodes.map((node) => ({
            ...node,
            position: posMap.get(node.id) ?? node.position,
          })),
        );
        lastRelayoutKeyRef.current = nodesKey;
        // fit sau khi positions được commit → chờ 2 rAF như FitViewSync
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fitView({ duration: 250, padding: 0.2 });
            onReady();
          });
        });
      })
      .catch(() => {
        // Nếu ELK fail (hiếm), vẫn reveal graph với layout pass 1.
        if (cancelled) return;
        lastRelayoutKeyRef.current = nodesKey;
        onReady();
      });

    return () => {
      cancelled = true;
    };
  }, [
    initialized,
    nodesKey,
    edges,
    relationMode,
    getNodes,
    setNodes,
    fitView,
    onReady,
  ]);

  return null;
}

// ── Main canvas ─────────────────────────────────────────────────────────────

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
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const fitRef = useRef<(() => void) | null>(null);
  const displayNodes = initialNodes;
  const displayEdges = initialEdges;

  // ── Two-pass layout readiness ─────────────────────────────────────────────
  // Stable key để ClusterRelayout biết khi nào tập node đã đổi (chuyển focus,
  // expand cluster, đổi relation mode). Reset isLayoutReady theo key này —
  // nếu graph không có cluster thì ready ngay, không flash opacity.
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
  const handleLayoutReady = useCallback(() => {
    setIsLayoutReady(true);
  }, []);

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
        const offset = Math.max(
          Math.min(centeredIndex * spread, maxOffset),
          -maxOffset,
        );

        offsets.set(edge.id, offset);
      });
    }

    return offsets;
  }, [initialEdges]);

  useEffect(() => {
    if (enableFocusLayout) {
      fitRef.current?.();
    }
  }, [displayNodes, displayEdges, enableFocusLayout]);

  const activeNodeIds = useMemo(() => {
    if (selectedNodeId) {
      return highlightedNodeIds ?? new Set<string>([selectedNodeId]);
    }

    if (hoveredNodeId) {
      return new Set<string>([hoveredNodeId]);
    }

    return null;
  }, [highlightedNodeIds, hoveredNodeId, selectedNodeId]);

  // Extend activeNodeIds so cluster nodes light up whenever any of their
  // contained leaf ids is active. Without this, clusters render at 0.22 opacity
  // when the focus is selected.
  const effectiveActiveNodeIds = useMemo(() => {
    if (!activeNodeIds) return null;
    const result = new Set(activeNodeIds);
    for (const node of initialNodes) {
      if (node.type !== "clusterNode") continue;
      const clusterNodeIds = (node.data as { nodeIds?: string[] } | undefined)
        ?.nodeIds;
      if (clusterNodeIds?.some((id) => activeNodeIds.has(id))) {
        result.add(node.id);
      }
    }
    return result;
  }, [activeNodeIds, initialNodes]);

  // Apply a fresh layout only when the graph data changes. Do not include zoom or
  // selection here, otherwise dragging a node gets overwritten on every zoom tick.
  useEffect(() => {
    setNodes(
      displayNodes.map((n) => ({
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
  }, [displayNodes, setNodes]);

  // Sync visual state while preserving user-adjusted node positions.
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
        const relationAnchorId = selectedNodeId || hoveredNodeId;
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
          e.target === selectedNodeId ||
          e.source === hoveredNodeId ||
          e.target === hoveredNodeId;
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
            // curveOffset: edgeCurveOffsets.get(e.id) ?? 0,
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
    hoveredNodeId,
    initialEdges,
    cycleNodeIds,
    selectedNodeId,
    setEdges,
  ]);

  const handleNodeMouseEnter: NodeMouseHandler = useCallback(
    (_e, node) => setHoveredNodeId(node.id),
    [],
  );
  const handleNodeMouseLeave: NodeMouseHandler = useCallback(
    () => setHoveredNodeId(null),
    [],
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
      <ZoomSync onZoom={setZoom} />
      <FitViewSync fitRef={fitRef} />
      <ClusterRelayout
        edges={edges}
        relationMode={activeRelationMode}
        nodesKey={nodesKey}
        onReady={handleLayoutReady}
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
