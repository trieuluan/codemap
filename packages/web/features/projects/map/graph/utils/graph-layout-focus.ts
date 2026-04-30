import type { Node, Edge } from "reactflow";
import type { ProjectMapGraphResponse, ProjectMapGraphNode } from "@/features/projects/api";
import { getFileName } from "./graph-utils";
import {
  CLUSTER_NODE_HEIGHT,
  CLUSTER_NODE_WIDTH,
  DEFAULT_POSITION,
  FOCUS_RELATED_NODE_LIMIT,
  NODE_HEIGHT,
  NODE_WIDTH,
  edgeStyle,
  getMaxDegree,
  layoutWithElk,
  toFileEdge,
  toFileNode,
  type EdgeAggregate,
  type GraphClusterNodeData,
  type GraphEdge,
  type GraphLayoutResult,
  type GraphRelationMode,
  type LayoutContext,
} from "./graph-layout-shared";
import { pickLayoutAlgorithm } from "./graph-layout-folder";

function getHandlesForDirection(direction?: string): {
  sourceHandle: string;
  targetHandle: string;
} {
  switch (direction) {
    case "DOWN": return { sourceHandle: "bottom", targetHandle: "top" };
    case "UP": return { sourceHandle: "top", targetHandle: "bottom" };
    case "LEFT": return { sourceHandle: "left", targetHandle: "right" };
    case "RIGHT":
    default: return { sourceHandle: "right", targetHandle: "left" };
  }
}

function buildReverseEdgesByTarget(edges: GraphEdge[]) {
  const map = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const items = map.get(edge.target) ?? [];
    items.push(edge);
    map.set(edge.target, items);
  }
  return map;
}

function collectBlastRadius(edges: GraphEdge[], focusNodeId: string) {
  const reverseEdgesByTarget = buildReverseEdgesByTarget(edges);
  const edgeIds = new Set<string>();
  const nodeDepths = new Map<string, number>([[focusNodeId, 0]]);
  const visited = new Set<string>([focusNodeId]);
  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: focusNodeId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const edge of reverseEdgesByTarget.get(current.nodeId) ?? []) {
      edgeIds.add(edge.id);
      if (visited.has(edge.source)) continue;
      const depth = current.depth + 1;
      visited.add(edge.source);
      nodeDepths.set(edge.source, depth);
      queue.push({ nodeId: edge.source, depth });
    }
  }

  return { edgeIds, nodeDepths };
}

function getCycleIdsForFocus(
  cycles: ProjectMapGraphResponse["cycles"],
  focusNodeId: string,
) {
  return new Set(
    cycles
      .filter((cycle) => cycle.nodeIds.includes(focusNodeId))
      .flatMap((cycle) => cycle.nodeIds),
  );
}

function collectFocusNodeIds({
  graphData,
  focusNodeId,
  relationMode,
  cycleIdsForFocus,
  blastRadius,
}: {
  graphData: ProjectMapGraphResponse;
  focusNodeId: string;
  relationMode: GraphRelationMode;
  cycleIdsForFocus: Set<string>;
  blastRadius: ReturnType<typeof collectBlastRadius> | null;
}) {
  const relatedIds = new Set<string>([focusNodeId]);

  if (relationMode === "cycles") {
    for (const nodeId of cycleIdsForFocus) relatedIds.add(nodeId);
    return relatedIds;
  }

  if (relationMode === "blast-radius") {
    for (const nodeId of blastRadius?.nodeDepths.keys() ?? []) relatedIds.add(nodeId);
    return relatedIds;
  }

  for (const edge of graphData.edges) {
    if ((relationMode === "all" || relationMode === "outgoing") && edge.source === focusNodeId) {
      relatedIds.add(edge.target);
    }
    if ((relationMode === "all" || relationMode === "incoming") && edge.target === focusNodeId) {
      relatedIds.add(edge.source);
    }
  }

  return relatedIds;
}

function compareFocusNeighbor(
  left: ProjectMapGraphNode,
  right: ProjectMapGraphNode,
  relationMode: GraphRelationMode,
  blastRadius: ReturnType<typeof collectBlastRadius> | null,
) {
  if (relationMode === "blast-radius") {
    const diff =
      (blastRadius?.nodeDepths.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (blastRadius?.nodeDepths.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    if (diff !== 0) return diff;
  }
  const degreeDiff = (right.incomingCount + right.outgoingCount) - (left.incomingCount + left.outgoingCount);
  return degreeDiff !== 0 ? degreeDiff : left.path.localeCompare(right.path);
}

function limitFocusNodes({
  nodes,
  focusNode,
  relationMode,
  blastRadius,
}: {
  nodes: ProjectMapGraphNode[];
  focusNode: ProjectMapGraphNode;
  relationMode: GraphRelationMode;
  blastRadius: ReturnType<typeof collectBlastRadius> | null;
}): {
  nodes: ProjectMapGraphNode[];
  smartDefault: GraphLayoutResult["smartDefault"];
} {
  if (nodes.length <= FOCUS_RELATED_NODE_LIMIT + 1) return { nodes, smartDefault: null };

  const strongestNeighbors = nodes
    .filter((n) => n.id !== focusNode.id)
    .sort((l, r) => compareFocusNeighbor(l, r, relationMode, blastRadius))
    .slice(0, FOCUS_RELATED_NODE_LIMIT);
  const limitedNodes = [focusNode, ...strongestNeighbors];
  const isBlastRadius = relationMode === "blast-radius";

  return {
    nodes: limitedNodes,
    smartDefault: {
      shownCount: isBlastRadius ? Math.max(limitedNodes.length - 1, 0) : limitedNodes.length,
      totalCount: isBlastRadius ? Math.max(nodes.length - 1, 0) : nodes.length,
      mode: isBlastRadius ? "blast-radius" : "top-degree",
    },
  };
}

function filterFocusEdges({
  edges,
  relatedNodeIds,
  focusNodeId,
  relationMode,
  cycleIdsForFocus,
  blastRadius,
}: {
  edges: GraphEdge[];
  relatedNodeIds: Set<string>;
  focusNodeId: string;
  relationMode: GraphRelationMode;
  cycleIdsForFocus: Set<string>;
  blastRadius: ReturnType<typeof collectBlastRadius> | null;
}) {
  return edges.filter((edge) => {
    if (!relatedNodeIds.has(edge.source) || !relatedNodeIds.has(edge.target)) return false;
    if (relationMode === "incoming") return edge.target === focusNodeId;
    if (relationMode === "outgoing") return edge.source === focusNodeId;
    if (relationMode === "cycles") return cycleIdsForFocus.has(edge.source) && cycleIdsForFocus.has(edge.target);
    if (relationMode === "blast-radius") return blastRadius?.edgeIds.has(edge.id) ?? false;
    return true;
  });
}

async function buildFlatLayout(
  filteredNodes: ProjectMapGraphNode[],
  filteredEdges: ProjectMapGraphResponse["edges"],
  cycleNodeIds: Set<string>,
  context: LayoutContext = "focus-hub",
  relationMode?: GraphRelationMode,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const layoutOptions = pickLayoutAlgorithm(
    filteredNodes.length,
    getMaxDegree(filteredNodes),
    context,
    relationMode,
  );
  const { sourceHandle, targetHandle } = getHandlesForDirection(layoutOptions["elk.direction"]);
  const posMap = await layoutWithElk(
    filteredNodes.map((n) => ({ id: n.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    filteredEdges,
    layoutOptions,
  );

  return {
    nodes: filteredNodes.map((n) => toFileNode(n, posMap, cycleNodeIds)),
    edges: filteredEdges.map((e) => toFileEdge(e, cycleNodeIds, { sourceHandle, targetHandle })),
  };
}

function detectLeafClusters({
  focusNodeId,
  relatedNodes,
  relatedEdges,
}: {
  focusNodeId: string;
  relatedNodes: ProjectMapGraphNode[];
  relatedEdges: GraphEdge[];
}): {
  incomingLeaves: ProjectMapGraphNode[];
  outgoingLeaves: ProjectMapGraphNode[];
} {
  const degree = new Map<string, number>();
  const isImporter = new Set<string>();
  const isImported = new Set<string>();

  for (const edge of relatedEdges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    if (edge.target === focusNodeId) isImporter.add(edge.source);
    if (edge.source === focusNodeId) isImported.add(edge.target);
  }

  const incomingLeaves: ProjectMapGraphNode[] = [];
  const outgoingLeaves: ProjectMapGraphNode[] = [];

  for (const node of relatedNodes) {
    if (node.id === focusNodeId) continue;
    if ((degree.get(node.id) ?? 0) !== 1) continue;
    if (isImporter.has(node.id) && !isImported.has(node.id)) incomingLeaves.push(node);
    else if (isImported.has(node.id) && !isImporter.has(node.id)) outgoingLeaves.push(node);
  }

  return { incomingLeaves, outgoingLeaves };
}

const LEAF_CLUSTER_THRESHOLD = 8;

async function buildClusteredFocusLayout({
  focusNodeId,
  limitedNodes,
  relatedEdges,
  cycleNodeIds,
  expandedClusters,
  relationMode,
}: {
  focusNodeId: string;
  limitedNodes: ProjectMapGraphNode[];
  relatedEdges: GraphEdge[];
  cycleNodeIds: Set<string>;
  expandedClusters: Set<string>;
  relationMode: GraphRelationMode;
}): Promise<{
  nodes: Node[];
  edges: Edge[];
  clusters: GraphLayoutResult["clusters"];
}> {
  const { incomingLeaves, outgoingLeaves } = detectLeafClusters({
    focusNodeId,
    relatedNodes: limitedNodes,
    relatedEdges,
  });

  const incomingClusterId = `cluster:incoming:${focusNodeId}`;
  const outgoingClusterId = `cluster:outgoing:${focusNodeId}`;
  const shouldClusterIncoming = incomingLeaves.length >= LEAF_CLUSTER_THRESHOLD && !expandedClusters.has(incomingClusterId);
  const shouldClusterOutgoing = outgoingLeaves.length >= LEAF_CLUSTER_THRESHOLD && !expandedClusters.has(outgoingClusterId);

  if (!shouldClusterIncoming && !shouldClusterOutgoing) {
    const layout = await buildFlatLayout(limitedNodes, relatedEdges, cycleNodeIds, "focus-hub", relationMode);
    return { ...layout, clusters: [] };
  }

  const clusteredLeafIds = new Set<string>([
    ...(shouldClusterIncoming ? incomingLeaves.map((n) => n.id) : []),
    ...(shouldClusterOutgoing ? outgoingLeaves.map((n) => n.id) : []),
  ]);

  const keptNodes = limitedNodes.filter((n) => !clusteredLeafIds.has(n.id));
  const keptEdges = relatedEdges.filter(
    (e) => !clusteredLeafIds.has(e.source) && !clusteredLeafIds.has(e.target),
  );

  type ClusterBlueprint = {
    id: string;
    direction: "incoming" | "outgoing";
    nodeIds: string[];
    sample: string[];
    count: number;
  };
  const clusterBlueprints: ClusterBlueprint[] = [];
  const clusters: GraphLayoutResult["clusters"] = [];

  if (shouldClusterIncoming) {
    const sample = incomingLeaves.slice(0, 3).map((n) => getFileName(n.path));
    const bp = { id: incomingClusterId, direction: "incoming" as const, nodeIds: incomingLeaves.map((n) => n.id), sample, count: incomingLeaves.length };
    clusterBlueprints.push(bp);
    clusters.push(bp);
  }

  if (shouldClusterOutgoing) {
    const sample = outgoingLeaves.slice(0, 3).map((n) => getFileName(n.path));
    const bp = { id: outgoingClusterId, direction: "outgoing" as const, nodeIds: outgoingLeaves.map((n) => n.id), sample, count: outgoingLeaves.length };
    clusterBlueprints.push(bp);
    clusters.push(bp);
  }

  const syntheticEdges: Array<Pick<EdgeAggregate, "id" | "source" | "target">> = clusterBlueprints.map((c) => ({
    id: `cluster-edge:${c.id}`,
    source: c.direction === "incoming" ? c.id : focusNodeId,
    target: c.direction === "incoming" ? focusNodeId : c.id,
  }));

  const layoutOptions = pickLayoutAlgorithm(
    keptNodes.length + clusterBlueprints.length,
    getMaxDegree(keptNodes),
    "focus-hub",
    relationMode,
  );
  const { sourceHandle, targetHandle } = getHandlesForDirection(layoutOptions["elk.direction"]);

  const posMap = await layoutWithElk(
    [
      ...keptNodes.map((n) => ({ id: n.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
      ...clusterBlueprints.map((c) => ({ id: c.id, width: CLUSTER_NODE_WIDTH, height: CLUSTER_NODE_HEIGHT })),
    ],
    [...keptEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })), ...syntheticEdges],
    layoutOptions,
  );

  const clusterNodes: Node[] = clusterBlueprints.map((c) => ({
    id: c.id,
    type: "clusterNode",
    position: posMap.get(c.id) ?? DEFAULT_POSITION,
    data: {
      kind: "cluster" as const,
      direction: c.direction,
      focusId: focusNodeId,
      nodeIds: c.nodeIds,
      count: c.count,
      sample: c.sample,
    } satisfies GraphClusterNodeData,
  }));

  const clusterEdges: Edge[] = clusterBlueprints.map((c) => ({
    id: `cluster-edge:${c.id}`,
    source: c.direction === "incoming" ? c.id : focusNodeId,
    target: c.direction === "incoming" ? focusNodeId : c.id,
    sourceHandle,
    targetHandle,
    type: "smoothstep",
    label: `${c.count}`,
    style: edgeStyle(false),
  }));

  return {
    nodes: [...keptNodes.map((n) => toFileNode(n, posMap, cycleNodeIds)), ...clusterNodes],
    edges: [...keptEdges.map((e) => toFileEdge(e, cycleNodeIds, { sourceHandle, targetHandle })), ...clusterEdges],
    clusters,
  };
}

export async function relayoutFocusGraph({
  nodes,
  edges,
  relationMode,
}: {
  nodes: Array<{ id: string; width: number; height: number }>;
  edges: Array<{ id: string; source: string; target: string }>;
  relationMode: GraphRelationMode;
}): Promise<Map<string, { x: number; y: number }>> {
  const layoutOptions = pickLayoutAlgorithm(nodes.length, 0, "focus-hub", relationMode);
  return layoutWithElk(nodes, edges, layoutOptions);
}

export async function buildFileFocusGraphLayout(
  graphData: ProjectMapGraphResponse,
  focusNodeId: string,
  relationMode: GraphRelationMode = "all",
  expandedClusters: Set<string> = new Set(),
): Promise<GraphLayoutResult> {
  const cycleNodeIds = new Set<string>(graphData.cycles.flatMap((c) => c.nodeIds));
  const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]));
  const focusNode = nodeMap.get(focusNodeId);

  if (!focusNode) return { nodes: [], edges: [], cycleNodeIds, smartDefault: null, clusters: [] };

  const cycleIdsForFocus = getCycleIdsForFocus(graphData.cycles, focusNodeId);
  const blastRadius = relationMode === "blast-radius" ? collectBlastRadius(graphData.edges, focusNodeId) : null;

  if (relationMode === "cycles" && cycleIdsForFocus.size === 0) {
    return { nodes: [], edges: [], cycleNodeIds, smartDefault: null, clusters: [] };
  }

  const relatedIds = collectFocusNodeIds({ graphData, focusNodeId, relationMode, cycleIdsForFocus, blastRadius });
  const relatedNodes = Array.from(relatedIds)
    .map((id) => nodeMap.get(id))
    .filter((n): n is ProjectMapGraphNode => Boolean(n));
  const { nodes: limitedNodes, smartDefault } = limitFocusNodes({ nodes: relatedNodes, focusNode, relationMode, blastRadius });
  const relatedEdges = filterFocusEdges({
    edges: graphData.edges,
    relatedNodeIds: new Set(limitedNodes.map((n) => n.id)),
    focusNodeId,
    relationMode,
    cycleIdsForFocus,
    blastRadius,
  });

  const supportsClustering = relationMode === "all" || relationMode === "incoming" || relationMode === "outgoing";

  if (!supportsClustering) {
    const layout = await buildFlatLayout(limitedNodes, relatedEdges, cycleNodeIds, "focus-hub", relationMode);
    return { ...layout, cycleNodeIds, smartDefault, clusters: [] };
  }

  const clustered = await buildClusteredFocusLayout({
    focusNodeId, limitedNodes, relatedEdges, cycleNodeIds, expandedClusters, relationMode,
  });

  return { nodes: clustered.nodes, edges: clustered.edges, cycleNodeIds, smartDefault, clusters: clustered.clusters };
}
