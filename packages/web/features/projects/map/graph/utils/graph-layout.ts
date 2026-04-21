import ELK from "elkjs/lib/elk.bundled.js";
import type { Node, Edge } from "reactflow";
import type {
  ProjectMapGraphResponse,
  ProjectMapGraphNode,
  ProjectMapGraphFolderNode,
} from "@/features/projects/api";

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

const elk = new ELK();

type LayoutContext =
  | "full-file-graph"
  | "focus-hub"
  | "folder-overview"
  | "folder-structure";

const BASE_ELK_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.layered.spacing.nodeNodeBetweenLayers": "120",
  "elk.spacing.nodeNode": "60",
  "elk.edgeRouting": "ORTHOGONAL",

  // ← CÁC OPTIONS QUAN TRỌNG CHO HUB NODES:
  "elk.layered.highDegreeNodes.treatment": "true", // bật xử lý đặc biệt cho high-degree
  "elk.layered.highDegreeNodes.threshold": "16", // node có ≥ 16 edge → coi là hub
  "elk.layered.highDegreeNodes.treeHeight": "5", // nén tree-ish subgraph của hub

  "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
  "elk.layered.thoroughness": "15", // càng cao càng đẹp, chậm hơn (default 7)
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.nodePlacement.bk.edgeStraightening": "IMPROVE_STRAIGHTNESS",
};

export interface GraphLayoutResult {
  nodes: Node<ProjectMapGraphNode & { isInCycle?: boolean; zoom?: number }>[];
  edges: Edge[];
  cycleNodeIds: Set<string>;
  smartDefault: {
    shownCount: number;
    totalCount: number;
    mode: "top-degree" | "blast-radius";
  } | null;
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

export function pickLayoutAlgorithm(
  nodeCount: number,
  maxDegree: number,
  context: LayoutContext,
  relationMode?: GraphRelationMode,
): Record<string, string> {
  if (context === "focus-hub") {
    // Blast radius — cây tự nhiên, mrtree đẹp nhất
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

    // Pure fan-out với ít nodes — mrtree cũng hợp
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
        // Giảm cycle breaking để giữ hướng import nguyên vẹn
        "elk.layered.cycleBreaking.strategy": "GREEDY",
      };
    }

    // Focus cực lớn (> 80 nodes) — cột layered sẽ quá dài,
    // chuyển stress để trải 2D.
    return {
      "elk.algorithm": "stress",
      "elk.stress.desiredEdgeLength": "200",
      "elk.stress.epsilon": "0.0001",
      "elk.spacing.nodeNode": "80",
      "elk.edgeRouting": "SPLINES",
      "elk.randomSeed": "1",
    };
  }

  // 2. Folder grouped — giữ layered (hợp với structure)
  if (context === "folder-overview") {
    return BASE_ELK_OPTIONS;
  }

  // 3. Full graph
  const hasBigHub = maxDegree >= 20;
  const isSmall = nodeCount < 30;

  if (hasBigHub && !isSmall) {
    // Graph có hub lớn → force-directed
    return {
      "elk.algorithm": "stress",
      "elk.stress.desiredEdgeLength": "160",
      "elk.randomSeed": "1",
      "elk.spacing.nodeNode": "70",
      "elk.edgeRouting": "SPLINES",
    };
  }

  // Mặc định: layered nhưng có treatment cho hub
  return BASE_ELK_OPTIONS;
}

export async function buildFolderGraphLayout(
  graphData: ProjectMapGraphResponse,
): Promise<FolderGraphLayoutResult> {
  const elkGraph = {
    id: "root",
    layoutOptions: pickLayoutAlgorithm(
      graphData.folderNodes.length,
      Math.max(
        ...graphData.folderNodes.map((n) => n.incomingCount + n.outgoingCount),
      ),
      "folder-overview",
    ),
    children: graphData.folderNodes.map((node) => ({
      id: node.id,
      width: FOLDER_NODE_WIDTH,
      height: FOLDER_NODE_HEIGHT,
    })),
    edges: graphData.folderEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layouted = await elk.layout(elkGraph);
  const posMap = new Map<string, { x: number; y: number }>();

  for (const child of layouted.children ?? []) {
    posMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  return {
    nodes: graphData.folderNodes.map((node) => ({
      id: node.id,
      type: "folderOverview",
      position: posMap.get(node.id) ?? { x: 0, y: 0 },
      data: node,
    })),
    edges: graphData.folderEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      label: edge.edgeCount > 1 ? String(edge.edgeCount) : undefined,
      style: folderEdgeStyle(edge.edgeCount),
    })),
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

  const edgeCounts = new Map<
    string,
    { id: string; source: string; target: string; edgeCount: number }
  >();

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

  const elkGraph = {
    id: "root",
    layoutOptions: pickLayoutAlgorithm(
      childNodes.length,
      Math.max(
        ...childNodes.map((n) => getNodeDegree(n as ProjectMapGraphNode)),
      ),
      "folder-structure",
    ),
    children: childNodes.map((node) => ({
      id: node.id,
      width: "path" in node ? NODE_WIDTH : FOLDER_NODE_WIDTH,
      height: "path" in node ? NODE_HEIGHT : FOLDER_NODE_HEIGHT,
    })),
    edges: childEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layouted = await elk.layout(elkGraph);
  const posMap = new Map<string, { x: number; y: number }>();

  for (const child of layouted.children ?? []) {
    posMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  return {
    nodes: childNodes.map((node) => {
      if ("path" in node) {
        return {
          id: node.id,
          type: "fileNode",
          position: posMap.get(node.id) ?? { x: 0, y: 0 },
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
        position: posMap.get(node.id) ?? { x: 0, y: 0 },
        data: {
          ...node,
          folder: getFolderLabel(node.folder),
          structureKind: "folder" as const,
          childPath: node.folder,
        },
      };
    }),
    edges: childEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      label: edge.edgeCount > 1 ? String(edge.edgeCount) : undefined,
      style: folderEdgeStyle(edge.edgeCount),
    })),
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
    Math.max(0, ...filteredNodes.map((n) => getNodeDegree(n))),
    context,
    relationMode,
  );
  const { sourceHandle, targetHandle } = getHandlesForDirection(
    layoutOptions["elk.direction"],
  );

  const elkGraph = {
    id: "root",
    layoutOptions,
    children: filteredNodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: filteredEdges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layouted = await elk.layout(elkGraph);

  const posMap = new Map<string, { x: number; y: number }>();
  for (const child of layouted.children ?? []) {
    posMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  const nodes: Node[] = filteredNodes.map((node) => ({
    id: node.id,
    type: "fileNode",
    position: posMap.get(node.id) ?? { x: 0, y: 0 },
    data: { ...node, isInCycle: cycleNodeIds.has(node.id) },
  }));

  const edges: Edge[] = filteredEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle,
    targetHandle,
    type: "smoothstep",
    style: edgeStyle(cycleNodeIds.has(e.source) && cycleNodeIds.has(e.target)),
  }));

  return { nodes, edges };
}

export async function buildFileFocusGraphLayout(
  graphData: ProjectMapGraphResponse,
  focusNodeId: string,
  relationMode: GraphRelationMode = "all",
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
    };
  }

  const relatedIds = new Set<string>([focusNodeId]);
  const cycleIdsForFocus = new Set(
    graphData.cycles
      .filter((cycle) => cycle.nodeIds.includes(focusNodeId))
      .flatMap((cycle) => cycle.nodeIds),
  );
  const blastRadiusEdgeIds = new Set<string>();
  const blastRadiusDepthByNode = new Map<string, number>([[focusNodeId, 0]]);

  if (relationMode === "cycles" && cycleIdsForFocus.size === 0) {
    return {
      nodes: [],
      edges: [],
      cycleNodeIds,
      smartDefault: null,
    };
  }

  if (relationMode === "blast-radius") {
    const reverseEdgesByTarget = new Map<
      string,
      ProjectMapGraphResponse["edges"]
    >();

    for (const edge of graphData.edges) {
      const items = reverseEdgesByTarget.get(edge.target) ?? [];
      items.push(edge);
      reverseEdgesByTarget.set(edge.target, items);
    }

    const visited = new Set<string>([focusNodeId]);
    const queue: Array<{ nodeId: string; depth: number }> = [
      { nodeId: focusNodeId, depth: 0 },
    ];

    while (queue.length > 0) {
      const currentItem = queue.shift();

      if (!currentItem) {
        continue;
      }

      const { nodeId: currentNodeId, depth } = currentItem;

      for (const edge of reverseEdgesByTarget.get(currentNodeId) ?? []) {
        blastRadiusEdgeIds.add(edge.id);

        if (visited.has(edge.source)) {
          continue;
        }

        visited.add(edge.source);
        blastRadiusDepthByNode.set(edge.source, depth + 1);
        relatedIds.add(edge.source);
        queue.push({ nodeId: edge.source, depth: depth + 1 });
      }
    }
  }

  for (const edge of graphData.edges) {
    if (relationMode === "cycles" || relationMode === "blast-radius") {
      continue;
    }

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

  if (relationMode === "cycles") {
    for (const nodeId of cycleIdsForFocus) {
      relatedIds.add(nodeId);
    }
  }

  let relatedNodes = Array.from(relatedIds)
    .map((nodeId) => nodeMap.get(nodeId))
    .filter((node): node is ProjectMapGraphNode => Boolean(node));
  const totalRelatedCount = relatedNodes.length;
  let smartDefault: GraphLayoutResult["smartDefault"] = null;

  if (relatedNodes.length > FOCUS_RELATED_NODE_LIMIT + 1) {
    const focus = focusNode;
    const strongestNeighbors = relatedNodes
      .filter((node) => node.id !== focusNodeId)
      .sort((left, right) => {
        if (relationMode === "blast-radius") {
          const depthDifference =
            (blastRadiusDepthByNode.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
            (blastRadiusDepthByNode.get(right.id) ?? Number.MAX_SAFE_INTEGER);

          if (depthDifference !== 0) {
            return depthDifference;
          }
        }

        const degreeDifference = getNodeDegree(right) - getNodeDegree(left);

        if (degreeDifference !== 0) {
          return degreeDifference;
        }

        return left.path.localeCompare(right.path);
      })
      .slice(0, FOCUS_RELATED_NODE_LIMIT);

    relatedNodes = [focus, ...strongestNeighbors];
    smartDefault = {
      shownCount:
        relationMode === "blast-radius"
          ? Math.max(relatedNodes.length - 1, 0)
          : relatedNodes.length,
      totalCount:
        relationMode === "blast-radius"
          ? Math.max(totalRelatedCount - 1, 0)
          : totalRelatedCount,
      mode: relationMode === "blast-radius" ? "blast-radius" : "top-degree",
    };
  }

  const relatedNodeIds = new Set(relatedNodes.map((node) => node.id));
  const relatedEdges = graphData.edges.filter((edge) => {
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
      return blastRadiusEdgeIds.has(edge.id);
    }

    return true;
  });

  const layout = await buildFlatLayout(
    relatedNodes,
    relatedEdges,
    cycleNodeIds,
    "focus-hub",
    relationMode,
  );

  return {
    ...layout,
    cycleNodeIds,
    smartDefault,
  };
}
