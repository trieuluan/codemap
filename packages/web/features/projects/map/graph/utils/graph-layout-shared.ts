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

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 72;
export const FOLDER_NODE_WIDTH = 260;
export const FOLDER_NODE_HEIGHT = 142;
export const STRUCTURE_DIRECT_FILE_LIMIT = 40;
export const FOCUS_RELATED_NODE_LIMIT = 40;
export const LEAF_CLUSTER_THRESHOLD = 8;
export const CLUSTER_NODE_WIDTH = 220;
export const CLUSTER_NODE_HEIGHT = 96;

export const elk = new ELK();
export const DEFAULT_POSITION = { x: 0, y: 0 };

export type LayoutContext = "focus-hub" | "folder-overview" | "folder-structure";
export type GraphEdge = ProjectMapGraphResponse["edges"][number];
export type EdgeAggregate = {
  id: string;
  source: string;
  target: string;
  edgeCount: number;
};
export type SizedLayoutNode = {
  id: string;
  width: number;
  height: number;
};

export const BASE_ELK_OPTIONS = {
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

export function edgeStyle(isCycle: boolean) {
  return isCycle
    ? { stroke: "rgb(239 68 68 / 0.6)", strokeWidth: 2 }
    : { stroke: "rgb(148 163 184 / 0.3)", strokeWidth: 1 };
}

export function folderEdgeStyle(edgeCount: number) {
  return {
    stroke: "rgb(59 130 246 / 0.35)",
    strokeWidth: Math.min(Math.max(edgeCount / 2, 1.5), 5),
  };
}

export function getNodeDegree(node: ProjectMapGraphNode): number {
  return node.incomingCount + node.outgoingCount;
}

export function getMaxDegree(
  nodes: Array<Pick<ProjectMapGraphNode, "incomingCount" | "outgoingCount">>,
) {
  return Math.max(
    0,
    ...nodes.map((node) => node.incomingCount + node.outgoingCount),
  );
}

export async function layoutWithElk(
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

export function toFolderEdge(
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

export function toFileNode(
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

export function toFileEdge(
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
