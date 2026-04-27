import ELK from "elkjs/lib/elk.bundled.js";
import type { Node, Edge } from "reactflow";
import type {
  ProjectMapGraphResponse,
  ProjectMapGraphNode,
  ProjectMapGraphFolderNode,
} from "@/features/projects/api";
import { getFileName } from "./graph-utils";

export interface FolderGraphLayoutResult {
  nodes: Node<ProjectMapGraphFolderNode & { zoom?: number }>[];
  edges: Edge[];
}

export interface FolderStructureLayoutResult {
  nodes: Node<
    (ProjectMapGraphFolderNode | ProjectMapGraphNode) & {
      zoom?: number;
      structureKind?: "folder" | "file";
      childPath?: string;
      externalOutgoingCount?: number;
      externalIncomingCount?: number;
    }
  >[];
  edges: Edge[];
  childFolderCount: number;
  directFileCount: number;
  hiddenDirectFileCount: number;
}

export type GraphRelationMode =
  | "all"
  | "incoming"
  | "outgoing"
  | "cycles"
  | "blast-radius";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 72;
const FOLDER_NODE_WIDTH = 260;
const FOLDER_NODE_HEIGHT = 142;
const STRUCTURE_DIRECT_FILE_LIMIT = 40;
const FOCUS_RELATED_NODE_LIMIT = 40;
const LEAF_CLUSTER_THRESHOLD = 8;
const CLUSTER_NODE_WIDTH = 220;
const CLUSTER_NODE_HEIGHT = 96;

const elk = new ELK();
const DEFAULT_POSITION = { x: 0, y: 0 };

type LayoutContext = "focus-hub" | "folder-overview" | "folder-structure";
type GraphEdge = ProjectMapGraphResponse["edges"][number];
type EdgeAggregate = {
  id: string;
  source: string;
  target: string;
  edgeCount: number;
};
type SizedLayoutNode = {
  id: string;
  width: number;
  height: number;
};

const BASE_ELK_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.layered.spacing.nodeNodeBetweenLayers": "120",
  "elk.spacing.nodeNode": "60",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.highDegreeNodes.treatment": "true",
  "elk.layered.highDegreeNodes.threshold": "16",
  "elk.layered.highDegreeNodes.treeHeight": "5",
  "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
  "elk.layered.thoroughness": "15",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.nodePlacement.bk.edgeStraightening": "IMPROVE_STRAIGHTNESS",
};

export interface GraphClusterSummary {
  id: string;
  direction: "incoming" | "outgoing";
  nodeIds: string[];
  count: number;
  sample: string[];
}

export interface GraphClusterNodeData {
  kind: "cluster";
  direction: "incoming" | "outgoing";
  focusId: string;
  nodeIds: string[];
  count: number;
  sample: string[];
}

export interface GraphLayoutResult {
  nodes: Node<
    | (ProjectMapGraphNode & { isInCycle?: boolean; zoom?: number })
    | GraphClusterNodeData
  >[];
  edges: Edge[];
  cycleNodeIds: Set<string>;
  smartDefault: {
    shownCount: number;
    totalCount: number;
    mode: "top-degree" | "blast-radius";
  } | null;
  clusters: GraphClusterSummary[];
}

// ─── helpers ────────────────────────────────────────────────────────────────

function edgeStyle(isCycle: boolean) {
  return isCycle
    ? { stroke: "rgb(239 68 68 / 0.6)", strokeWidth: 2 }
    : { stroke: "rgb(148 163 184 / 0.3)", strokeWidth: 1 };
}

function folderEdgeStyle(edgeCount: number) {
  return {
    stroke: "rgb(59 130 246 / 0.35)",
    strokeWidth: Math.min(Math.max(edgeCount / 2, 1.5), 5),
  };
}

function isNodeUnderFolder(
  node: ProjectMapGraphNode,
  folderPath: string,
): boolean {
  if (folderPath === "(root)") {
    return true;
  }

  return node.path === folderPath || node.path.startsWith(`${folderPath}/`);
}

function getImmediateChildKey(
  node: ProjectMapGraphNode,
  folderPath: string,
):
  | { kind: "folder"; path: string; label: string }
  | { kind: "file"; path: string }
  | null {
  if (folderPath === "(root)") {
    const slashIndex = node.path.indexOf("/");

    if (slashIndex === -1) {
      return { kind: "file", path: node.path };
    }

    const label = node.path.slice(0, slashIndex);
    return { kind: "folder", path: label, label };
  }

  if (!node.path.startsWith(`${folderPath}/`)) {
    return null;
  }

  const remainder = node.path.slice(folderPath.length + 1);
  const slashIndex = remainder.indexOf("/");

  if (slashIndex === -1) {
    return { kind: "file", path: node.path };
  }

  const label = remainder.slice(0, slashIndex);
  return {
    kind: "folder",
    path: `${folderPath}/${label}`,
    label,
  };
}

function getFolderLabel(folderPath: string): string {
  if (folderPath === "(root)") return "(root)";
  return folderPath.split("/").pop() ?? folderPath;
}

function getNodeDegree(node: ProjectMapGraphNode): number {
  return node.incomingCount + node.outgoingCount;
}

function getMaxDegree(
  nodes: Array<Pick<ProjectMapGraphNode, "incomingCount" | "outgoingCount">>,
) {
  return Math.max(
    0,
    ...nodes.map((node) => node.incomingCount + node.outgoingCount),
  );
}

async function layoutWithElk(
  children: SizedLayoutNode[],
  edges: Array<Pick<EdgeAggregate, "id" | "source" | "target">>,
  layoutOptions: Record<string, string>,
) {
  const layouted = await elk.layout({
    id: "root",
    layoutOptions,
    children,
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });

  return new Map(
    (layouted.children ?? []).map((child) => [
      child.id,
      { x: child.x ?? 0, y: child.y ?? 0 },
    ]),
  );
}

function toFolderEdge(
  edge: Pick<EdgeAggregate, "id" | "source" | "target" | "edgeCount">,
): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    label: edge.edgeCount > 1 ? String(edge.edgeCount) : undefined,
    style: folderEdgeStyle(edge.edgeCount),
  };
}

function toFileNode(
  node: ProjectMapGraphNode,
  posMap: Map<string, { x: number; y: number }>,
  cycleNodeIds: Set<string>,
): Node {
  return {
    id: node.id,
    type: "fileNode",
    position: posMap.get(node.id) ?? DEFAULT_POSITION,
    data: { ...node, isInCycle: cycleNodeIds.has(node.id) },
  };
}

function toFileEdge(
  edge: GraphEdge,
  cycleNodeIds: Set<string>,
  handles?: { sourceHandle: string; targetHandle: string },
): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: handles?.sourceHandle,
    targetHandle: handles?.targetHandle,
    type: "smoothstep",
    style: edgeStyle(
      cycleNodeIds.has(edge.source) && cycleNodeIds.has(edge.target),
    ),
  };
}

function buildReverseEdgesByTarget(edges: GraphEdge[]) {
  const reverseEdgesByTarget = new Map<string, GraphEdge[]>();

  for (const edge of edges) {
    const items = reverseEdgesByTarget.get(edge.target) ?? [];
    items.push(edge);
    reverseEdgesByTarget.set(edge.target, items);
  }

  return reverseEdgesByTarget;
}

function collectBlastRadius(edges: GraphEdge[], focusNodeId: string) {
  const reverseEdgesByTarget = buildReverseEdgesByTarget(edges);
  const edgeIds = new Set<string>();
  const nodeDepths = new Map<string, number>([[focusNodeId, 0]]);
  const visited = new Set<string>([focusNodeId]);
  const queue: Array<{ nodeId: string; depth: number }> = [
    { nodeId: focusNodeId, depth: 0 },
  ];

  while (queue.length > 0) {
    const currentItem = queue.shift();

    if (!currentItem) {
      continue;
    }

    for (const edge of reverseEdgesByTarget.get(currentItem.nodeId) ?? []) {
      edgeIds.add(edge.id);

      if (visited.has(edge.source)) {
        continue;
      }

      const depth = currentItem.depth + 1;
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
    for (const nodeId of cycleIdsForFocus) {
      relatedIds.add(nodeId);
    }

    return relatedIds;
  }

  if (relationMode === "blast-radius") {
    for (const nodeId of blastRadius?.nodeDepths.keys() ?? []) {
      relatedIds.add(nodeId);
    }

    return relatedIds;
  }

  for (const edge of graphData.edges) {
    if (
      (relationMode === "all" || relationMode === "outgoing") &&
      edge.source === focusNodeId
    ) {
      relatedIds.add(edge.target);
    }

    if (
      (relationMode === "all" || relationMode === "incoming") &&
      edge.target === focusNodeId
    ) {
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
    const depthDifference =
      (blastRadius?.nodeDepths.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (blastRadius?.nodeDepths.get(right.id) ?? Number.MAX_SAFE_INTEGER);

    if (depthDifference !== 0) {
      return depthDifference;
    }
  }

  const degreeDifference = getNodeDegree(right) - getNodeDegree(left);

  return degreeDifference !== 0
    ? degreeDifference
    : left.path.localeCompare(right.path);
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
  if (nodes.length <= FOCUS_RELATED_NODE_LIMIT + 1) {
    return { nodes, smartDefault: null };
  }

  const strongestNeighbors = nodes
    .filter((node) => node.id !== focusNode.id)
    .sort((left, right) =>
      compareFocusNeighbor(left, right, relationMode, blastRadius),
    )
    .slice(0, FOCUS_RELATED_NODE_LIMIT);
  const limitedNodes = [focusNode, ...strongestNeighbors];
  const isBlastRadius = relationMode === "blast-radius";

  return {
    nodes: limitedNodes,
    smartDefault: {
      shownCount: isBlastRadius
        ? Math.max(limitedNodes.length - 1, 0)
        : limitedNodes.length,
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
    if (!relatedNodeIds.has(edge.source) || !relatedNodeIds.has(edge.target)) {
      return false;
    }

    if (relationMode === "incoming") {
      return edge.target === focusNodeId;
    }

    if (relationMode === "outgoing") {
      return edge.source === focusNodeId;
    }

    if (relationMode === "cycles") {
      return (
        cycleIdsForFocus.has(edge.source) && cycleIdsForFocus.has(edge.target)
      );
    }

    if (relationMode === "blast-radius") {
      return blastRadius?.edgeIds.has(edge.id) ?? false;
    }

    return true;
  });
}

export function pickLayoutAlgorithm(
  nodeCount: number,
  maxDegree: number,
  context: LayoutContext,
  relationMode?: GraphRelationMode,
): Record<string, string> {
  if (context === "focus-hub") {
    if (relationMode === "blast-radius" && nodeCount <= 60) {
      return {
        "elk.algorithm": "mrtree",
        "elk.direction": "DOWN",
        "elk.mrtree.searchOrder": "DFS",
        "elk.spacing.nodeNode": "40",
        "elk.layered.spacing.nodeNodeBetweenLayers": "120",
        "elk.edgeRoutingMode": "MIDDLE_TO_MIDDLE",
      };
    }

    if (relationMode === "outgoing" && nodeCount <= 20) {
      return {
        "elk.algorithm": "mrtree",
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "50",
      };
    }
    if (nodeCount <= 80) {
      return {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.layered.spacing.nodeNodeBetweenLayers": "140",
        "elk.spacing.nodeNode": "30",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.thoroughness": "15",
        "elk.layered.cycleBreaking.strategy": "GREEDY",
      };
    }

    return {
      "elk.algorithm": "stress",
      "elk.stress.desiredEdgeLength": "200",
      "elk.stress.epsilon": "0.0001",
      "elk.spacing.nodeNode": "80",
      "elk.edgeRouting": "SPLINES",
      "elk.randomSeed": "1",
    };
  }

  if (context === "folder-overview") {
    return BASE_ELK_OPTIONS;
  }

  const hasBigHub = maxDegree >= 20;
  const isSmall = nodeCount < 30;

  if (hasBigHub && !isSmall) {
    return {
      "elk.algorithm": "stress",
      "elk.stress.desiredEdgeLength": "160",
      "elk.randomSeed": "1",
      "elk.spacing.nodeNode": "70",
      "elk.edgeRouting": "SPLINES",
    };
  }

  return BASE_ELK_OPTIONS;
}

export async function buildFolderGraphLayout(
  graphData: ProjectMapGraphResponse,
): Promise<FolderGraphLayoutResult> {
  const posMap = await layoutWithElk(
    graphData.folderNodes.map((node) => ({
      id: node.id,
      width: FOLDER_NODE_WIDTH,
      height: FOLDER_NODE_HEIGHT,
    })),
    graphData.folderEdges,
    pickLayoutAlgorithm(
      graphData.folderNodes.length,
      getMaxDegree(graphData.folderNodes),
      "folder-overview",
    ),
  );

  return {
    nodes: graphData.folderNodes.map((node) => ({
      id: node.id,
      type: "folderOverview",
      position: posMap.get(node.id) ?? DEFAULT_POSITION,
      data: node,
    })),
    edges: graphData.folderEdges.map(toFolderEdge),
  };
}

export async function buildFolderStructureLayout(
  graphData: ProjectMapGraphResponse,
  folderPath: string,
): Promise<FolderStructureLayoutResult> {
  const folderBuckets = new Map<
    string,
    {
      id: string;
      folder: string;
      fileCount: number;
      sourceFileCount: number;
      incomingCount: number;
      outgoingCount: number;
      internalEdgeCount: number;
      externalOutgoingCount: number;
      externalIncomingCount: number;
    }
  >();
  const directFiles = new Map<string, ProjectMapGraphNode>();
  const directFileExternalCounts = new Map<
    string,
    { externalOutgoingCount: number; externalIncomingCount: number }
  >();
  const fileToBucket = new Map<string, string>();

  for (const node of graphData.nodes) {
    if (!isNodeUnderFolder(node, folderPath)) {
      continue;
    }

    const child = getImmediateChildKey(node, folderPath);
    if (!child) {
      continue;
    }

    if (child.kind === "file") {
      directFiles.set(node.id, node);
      directFileExternalCounts.set(node.id, {
        externalOutgoingCount: 0,
        externalIncomingCount: 0,
      });
      fileToBucket.set(node.id, node.id);
      continue;
    }

    const bucketId = `structure-folder:${child.path}`;
    const bucket = folderBuckets.get(child.path) ?? {
      id: bucketId,
      folder: child.path,
      fileCount: 0,
      sourceFileCount: 0,
      incomingCount: 0,
      outgoingCount: 0,
      internalEdgeCount: 0,
      externalOutgoingCount: 0,
      externalIncomingCount: 0,
    };

    bucket.fileCount += 1;
    if (node.isParseable) {
      bucket.sourceFileCount += 1;
    }
    bucket.incomingCount += node.incomingCount;
    bucket.outgoingCount += node.outgoingCount;
    fileToBucket.set(node.id, bucketId);
    folderBuckets.set(child.path, bucket);
  }

  const sortedDirectFiles = Array.from(directFiles.values()).sort(
    (left, right) => {
      const degreeDifference = getNodeDegree(right) - getNodeDegree(left);

      if (degreeDifference !== 0) {
        return degreeDifference;
      }

      return left.path.localeCompare(right.path);
    },
  );
  const visibleDirectFiles = sortedDirectFiles.slice(
    0,
    STRUCTURE_DIRECT_FILE_LIMIT,
  );
  const visibleFileIds = new Set(visibleDirectFiles.map((node) => node.id));
  const visibleBucketIds = new Set<string>([
    ...Array.from(folderBuckets.values()).map((bucket) => bucket.id),
    ...visibleFileIds,
  ]);
  const folderBucketById = new Map(
    Array.from(folderBuckets.values()).map((bucket) => [bucket.id, bucket]),
  );

  const edgeCounts = new Map<string, EdgeAggregate>();

  for (const edge of graphData.edges) {
    const sourceBucket = fileToBucket.get(edge.source);
    const targetBucket = fileToBucket.get(edge.target);

    if (sourceBucket && !targetBucket) {
      const sourceFolderBucket = folderBucketById.get(sourceBucket);
      const sourceFileCounts = directFileExternalCounts.get(sourceBucket);

      if (sourceFolderBucket) {
        sourceFolderBucket.externalOutgoingCount += 1;
      }

      if (sourceFileCounts) {
        sourceFileCounts.externalOutgoingCount += 1;
      }

      continue;
    }

    if (!sourceBucket && targetBucket) {
      const targetFolderBucket = folderBucketById.get(targetBucket);
      const targetFileCounts = directFileExternalCounts.get(targetBucket);

      if (targetFolderBucket) {
        targetFolderBucket.externalIncomingCount += 1;
      }

      if (targetFileCounts) {
        targetFileCounts.externalIncomingCount += 1;
      }

      continue;
    }

    if (!sourceBucket || !targetBucket) {
      continue;
    }

    if (sourceBucket === targetBucket) {
      const folderBucket = folderBucketById.get(sourceBucket);

      if (folderBucket) {
        folderBucket.internalEdgeCount += 1;
      }

      continue;
    }

    if (
      !visibleBucketIds.has(sourceBucket) ||
      !visibleBucketIds.has(targetBucket)
    ) {
      continue;
    }

    const key = `${sourceBucket}->${targetBucket}`;
    const aggregate = edgeCounts.get(key) ?? {
      id: `structure-edge:${key}`,
      source: sourceBucket,
      target: targetBucket,
      edgeCount: 0,
    };

    aggregate.edgeCount += 1;
    edgeCounts.set(key, aggregate);
  }

  const folderNodes = Array.from(folderBuckets.values()).sort((left, right) => {
    if (left.sourceFileCount !== right.sourceFileCount) {
      return right.sourceFileCount - left.sourceFileCount;
    }

    return left.folder.localeCompare(right.folder);
  });
  const childNodes = [...folderNodes, ...visibleDirectFiles];
  const childEdges = Array.from(edgeCounts.values());

  const posMap = await layoutWithElk(
    childNodes.map((node) => ({
      id: node.id,
      width: "path" in node ? NODE_WIDTH : FOLDER_NODE_WIDTH,
      height: "path" in node ? NODE_HEIGHT : FOLDER_NODE_HEIGHT,
    })),
    childEdges,
    pickLayoutAlgorithm(
      childNodes.length,
      getMaxDegree(childNodes),
      "folder-structure",
    ),
  );

  return {
    nodes: childNodes.map((node) => {
      if ("path" in node) {
        return {
          id: node.id,
          type: "fileNode",
          position: posMap.get(node.id) ?? DEFAULT_POSITION,
          data: {
            ...node,
            structureKind: "file" as const,
            ...(directFileExternalCounts.get(node.id) ?? {
              externalOutgoingCount: 0,
              externalIncomingCount: 0,
            }),
          },
        };
      }

      return {
        id: node.id,
        type: "folderOverview",
        position: posMap.get(node.id) ?? DEFAULT_POSITION,
        data: {
          ...node,
          folder: getFolderLabel(node.folder),
          structureKind: "folder" as const,
          childPath: node.folder,
        },
      };
    }),
    edges: childEdges.map(toFolderEdge),
    childFolderCount: folderNodes.length,
    directFileCount: sortedDirectFiles.length,
    hiddenDirectFileCount: Math.max(
      sortedDirectFiles.length - visibleDirectFiles.length,
      0,
    ),
  };
}

// ─── flat layout (no grouping) ──────────────────────────────────────────────

// Map ELK direction → React Flow handle ids
function getHandlesForDirection(direction?: string): {
  sourceHandle: string;
  targetHandle: string;
} {
  switch (direction) {
    case "DOWN":
      return { sourceHandle: "bottom", targetHandle: "top" };
    case "UP":
      return { sourceHandle: "top", targetHandle: "bottom" };
    case "LEFT":
      return { sourceHandle: "left", targetHandle: "right" };
    case "RIGHT":
    default:
      return { sourceHandle: "right", targetHandle: "left" };
  }
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
  const { sourceHandle, targetHandle } = getHandlesForDirection(
    layoutOptions["elk.direction"],
  );
  const posMap = await layoutWithElk(
    filteredNodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    filteredEdges,
    layoutOptions,
  );

  const nodes: Node[] = filteredNodes.map((node) =>
    toFileNode(node, posMap, cycleNodeIds),
  );
  const edges: Edge[] = filteredEdges.map((edge) =>
    toFileEdge(edge, cycleNodeIds, { sourceHandle, targetHandle }),
  );

  return { nodes, edges };
}

// Detect pure leaf nodes (degree=1 in the filtered view) and split them by
// whether they import the focus (incoming) or are imported by it (outgoing).
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
  const isImporter = new Set<string>(); // node → focus
  const isImported = new Set<string>(); // focus → node

  for (const edge of relatedEdges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);

    if (edge.target === focusNodeId) {
      isImporter.add(edge.source);
    }
    if (edge.source === focusNodeId) {
      isImported.add(edge.target);
    }
  }

  const incomingLeaves: ProjectMapGraphNode[] = [];
  const outgoingLeaves: ProjectMapGraphNode[] = [];

  for (const node of relatedNodes) {
    if (node.id === focusNodeId) continue;
    if ((degree.get(node.id) ?? 0) !== 1) continue;

    if (isImporter.has(node.id) && !isImported.has(node.id)) {
      incomingLeaves.push(node);
    } else if (isImported.has(node.id) && !isImporter.has(node.id)) {
      outgoingLeaves.push(node);
    }
  }

  return { incomingLeaves, outgoingLeaves };
}

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

  const shouldClusterIncoming =
    incomingLeaves.length >= LEAF_CLUSTER_THRESHOLD &&
    !expandedClusters.has(incomingClusterId);
  const shouldClusterOutgoing =
    outgoingLeaves.length >= LEAF_CLUSTER_THRESHOLD &&
    !expandedClusters.has(outgoingClusterId);

  // Nothing to cluster — fall through to the plain flat layout.
  if (!shouldClusterIncoming && !shouldClusterOutgoing) {
    const layout = await buildFlatLayout(
      limitedNodes,
      relatedEdges,
      cycleNodeIds,
      "focus-hub",
      relationMode,
    );

    return { ...layout, clusters: [] };
  }

  const incomingLeafIds = new Set(incomingLeaves.map((n) => n.id));
  const outgoingLeafIds = new Set(outgoingLeaves.map((n) => n.id));

  const clusteredLeafIds = new Set<string>([
    ...(shouldClusterIncoming ? incomingLeafIds : []),
    ...(shouldClusterOutgoing ? outgoingLeafIds : []),
  ]);

  const keptNodes = limitedNodes.filter(
    (node) => !clusteredLeafIds.has(node.id),
  );
  const keptEdges = relatedEdges.filter(
    (edge) =>
      !clusteredLeafIds.has(edge.source) && !clusteredLeafIds.has(edge.target),
  );

  const clusters: GraphLayoutResult["clusters"] = [];
  type ClusterBlueprint = {
    id: string;
    direction: "incoming" | "outgoing";
    nodeIds: string[];
    sample: string[];
    count: number;
  };
  const clusterBlueprints: ClusterBlueprint[] = [];

  if (shouldClusterIncoming) {
    const sample = incomingLeaves.slice(0, 3).map((n) => getFileName(n.path));
    clusterBlueprints.push({
      id: incomingClusterId,
      direction: "incoming",
      nodeIds: incomingLeaves.map((n) => n.id),
      sample,
      count: incomingLeaves.length,
    });
    clusters.push({
      id: incomingClusterId,
      direction: "incoming",
      nodeIds: incomingLeaves.map((n) => n.id),
      count: incomingLeaves.length,
      sample,
    });
  }

  if (shouldClusterOutgoing) {
    const sample = outgoingLeaves.slice(0, 3).map((n) => getFileName(n.path));
    clusterBlueprints.push({
      id: outgoingClusterId,
      direction: "outgoing",
      nodeIds: outgoingLeaves.map((n) => n.id),
      sample,
      count: outgoingLeaves.length,
    });
    clusters.push({
      id: outgoingClusterId,
      direction: "outgoing",
      nodeIds: outgoingLeaves.map((n) => n.id),
      count: outgoingLeaves.length,
      sample,
    });
  }

  const syntheticEdges: Array<Pick<EdgeAggregate, "id" | "source" | "target">> =
    clusterBlueprints.map((cluster) => ({
      id: `cluster-edge:${cluster.id}`,
      source: cluster.direction === "incoming" ? cluster.id : focusNodeId,
      target: cluster.direction === "incoming" ? focusNodeId : cluster.id,
    }));

  const layoutOptions = pickLayoutAlgorithm(
    keptNodes.length + clusterBlueprints.length,
    getMaxDegree(keptNodes),
    "focus-hub",
    relationMode,
  );
  const { sourceHandle, targetHandle } = getHandlesForDirection(
    layoutOptions["elk.direction"],
  );

  const posMap = await layoutWithElk(
    [
      ...keptNodes.map((n) => ({
        id: n.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })),
      ...clusterBlueprints.map((c) => ({
        id: c.id,
        width: CLUSTER_NODE_WIDTH,
        height: CLUSTER_NODE_HEIGHT,
      })),
    ],
    [
      ...keptEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      })),
      ...syntheticEdges,
    ],
    layoutOptions,
  );

  const fileNodes: Node[] = keptNodes.map((n) =>
    toFileNode(n, posMap, cycleNodeIds),
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
    },
  }));

  const fileEdges: Edge[] = keptEdges.map((e) =>
    toFileEdge(e, cycleNodeIds, { sourceHandle, targetHandle }),
  );
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
    nodes: [...fileNodes, ...clusterNodes],
    edges: [...fileEdges, ...clusterEdges],
    clusters,
  };
}

// Re-layout pass dùng cho two-pass auto-layout: nhận nodes với width/height
// thực (do React Flow đo sau khi mount) và chạy lại ELK với cùng layoutOptions
// của focus-hub. Trả về position map thay vì React Flow nodes vì caller chỉ
// cần cập nhật position trên nodes đang có.
export async function relayoutFocusGraph({
  nodes,
  edges,
  relationMode,
}: {
  nodes: Array<{ id: string; width: number; height: number }>;
  edges: Array<{ id: string; source: string; target: string }>;
  relationMode: GraphRelationMode;
}): Promise<Map<string, { x: number; y: number }>> {
  const layoutOptions = pickLayoutAlgorithm(
    nodes.length,
    0,
    "focus-hub",
    relationMode,
  );

  return layoutWithElk(nodes, edges, layoutOptions);
}

export async function buildFileFocusGraphLayout(
  graphData: ProjectMapGraphResponse,
  focusNodeId: string,
  relationMode: GraphRelationMode = "all",
  expandedClusters: Set<string> = new Set(),
): Promise<GraphLayoutResult> {
  const cycleNodeIds = new Set<string>(
    graphData.cycles.flatMap((cycle) => cycle.nodeIds),
  );
  const nodeMap = new Map(graphData.nodes.map((node) => [node.id, node]));
  const focusNode = nodeMap.get(focusNodeId);

  if (!focusNode) {
    return {
      nodes: [],
      edges: [],
      cycleNodeIds,
      smartDefault: null,
      clusters: [],
    };
  }

  const cycleIdsForFocus = getCycleIdsForFocus(graphData.cycles, focusNodeId);
  const blastRadius =
    relationMode === "blast-radius"
      ? collectBlastRadius(graphData.edges, focusNodeId)
      : null;

  if (relationMode === "cycles" && cycleIdsForFocus.size === 0) {
    return {
      nodes: [],
      edges: [],
      cycleNodeIds,
      smartDefault: null,
      clusters: [],
    };
  }

  const relatedIds = collectFocusNodeIds({
    graphData,
    focusNodeId,
    relationMode,
    cycleIdsForFocus,
    blastRadius,
  });
  const relatedNodes = Array.from(relatedIds)
    .map((nodeId) => nodeMap.get(nodeId))
    .filter((node): node is ProjectMapGraphNode => Boolean(node));
  const { nodes: limitedNodes, smartDefault } = limitFocusNodes({
    nodes: relatedNodes,
    focusNode,
    relationMode,
    blastRadius,
  });

  const relatedEdges = filterFocusEdges({
    edges: graphData.edges,
    relatedNodeIds: new Set(limitedNodes.map((node) => node.id)),
    focusNodeId,
    relationMode,
    cycleIdsForFocus,
    blastRadius,
  });

  // Clustering only makes sense when leaves have a clear single direction to
  // the focus. Skip for cycles and blast-radius — those views need full detail.
  const supportsClustering =
    relationMode === "all" ||
    relationMode === "incoming" ||
    relationMode === "outgoing";

  if (!supportsClustering) {
    const layout = await buildFlatLayout(
      limitedNodes,
      relatedEdges,
      cycleNodeIds,
      "focus-hub",
      relationMode,
    );

    return {
      ...layout,
      cycleNodeIds,
      smartDefault,
      clusters: [],
    };
  }

  const clustered = await buildClusteredFocusLayout({
    focusNodeId,
    limitedNodes,
    relatedEdges,
    cycleNodeIds,
    expandedClusters,
    relationMode,
  });

  return {
    nodes: clustered.nodes,
    edges: clustered.edges,
    cycleNodeIds,
    smartDefault,
    clusters: clustered.clusters,
  };
}
