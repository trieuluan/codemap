import type { ProjectMapGraphResponse, ProjectMapGraphNode } from "@/features/projects/api";
import {
  BASE_ELK_OPTIONS,
  DEFAULT_POSITION,
  FOLDER_NODE_HEIGHT,
  FOLDER_NODE_WIDTH,
  NODE_HEIGHT,
  NODE_WIDTH,
  STRUCTURE_DIRECT_FILE_LIMIT,
  getMaxDegree,
  getNodeDegree,
  layoutWithElk,
  toFolderEdge,
  type EdgeAggregate,
  type FolderGraphLayoutResult,
  type FolderStructureLayoutResult,
  type GraphRelationMode,
  type LayoutContext,
} from "./graph-layout-shared";

function isNodeUnderFolder(
  node: ProjectMapGraphNode,
  folderPath: string,
): boolean {
  if (folderPath === "(root)") return true;
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
    if (slashIndex === -1) return { kind: "file", path: node.path };
    const label = node.path.slice(0, slashIndex);
    return { kind: "folder", path: label, label };
  }

  if (!node.path.startsWith(`${folderPath}/`)) return null;

  const remainder = node.path.slice(folderPath.length + 1);
  const slashIndex = remainder.indexOf("/");
  if (slashIndex === -1) return { kind: "file", path: node.path };

  const label = remainder.slice(0, slashIndex);
  return { kind: "folder", path: `${folderPath}/${label}`, label };
}

function getFolderLabel(folderPath: string): string {
  if (folderPath === "(root)") return "(root)";
  return folderPath.split("/").pop() ?? folderPath;
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

  if (context === "folder-overview") return BASE_ELK_OPTIONS;

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
    if (!isNodeUnderFolder(node, folderPath)) continue;
    const child = getImmediateChildKey(node, folderPath);
    if (!child) continue;

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
    if (node.isParseable) bucket.sourceFileCount += 1;
    bucket.incomingCount += node.incomingCount;
    bucket.outgoingCount += node.outgoingCount;
    fileToBucket.set(node.id, bucketId);
    folderBuckets.set(child.path, bucket);
  }

  const sortedDirectFiles = Array.from(directFiles.values()).sort((l, r) => {
    const diff = getNodeDegree(r) - getNodeDegree(l);
    return diff !== 0 ? diff : l.path.localeCompare(r.path);
  });
  const visibleDirectFiles = sortedDirectFiles.slice(0, STRUCTURE_DIRECT_FILE_LIMIT);
  const visibleFileIds = new Set(visibleDirectFiles.map((n) => n.id));
  const visibleBucketIds = new Set<string>([
    ...Array.from(folderBuckets.values()).map((b) => b.id),
    ...visibleFileIds,
  ]);
  const folderBucketById = new Map(
    Array.from(folderBuckets.values()).map((b) => [b.id, b]),
  );

  const edgeCounts = new Map<string, EdgeAggregate>();

  for (const edge of graphData.edges) {
    const sourceBucket = fileToBucket.get(edge.source);
    const targetBucket = fileToBucket.get(edge.target);

    if (sourceBucket && !targetBucket) {
      const sb = folderBucketById.get(sourceBucket);
      const sf = directFileExternalCounts.get(sourceBucket);
      if (sb) sb.externalOutgoingCount += 1;
      if (sf) sf.externalOutgoingCount += 1;
      continue;
    }

    if (!sourceBucket && targetBucket) {
      const tb = folderBucketById.get(targetBucket);
      const tf = directFileExternalCounts.get(targetBucket);
      if (tb) tb.externalIncomingCount += 1;
      if (tf) tf.externalIncomingCount += 1;
      continue;
    }

    if (!sourceBucket || !targetBucket) continue;

    if (sourceBucket === targetBucket) {
      const fb = folderBucketById.get(sourceBucket);
      if (fb) fb.internalEdgeCount += 1;
      continue;
    }

    if (!visibleBucketIds.has(sourceBucket) || !visibleBucketIds.has(targetBucket)) continue;

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

  const folderNodes = Array.from(folderBuckets.values()).sort((l, r) => {
    if (l.sourceFileCount !== r.sourceFileCount) return r.sourceFileCount - l.sourceFileCount;
    return l.folder.localeCompare(r.folder);
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
    pickLayoutAlgorithm(childNodes.length, getMaxDegree(childNodes), "folder-structure"),
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
    hiddenDirectFileCount: Math.max(sortedDirectFiles.length - visibleDirectFiles.length, 0),
  };
}
