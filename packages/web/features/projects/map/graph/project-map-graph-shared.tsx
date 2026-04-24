"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, GitBranch, Search, Zap } from "lucide-react";
import type {
  ProjectMapGraphNode,
  ProjectMapGraphResponse,
} from "@/features/projects/api";
import type { GraphRelationMode } from "./utils/graph-layout";

export type GraphMode = "overview" | "structure" | "focus";

export interface BlastRadiusSummary {
  impactedIds: Set<string>;
  totalCount: number;
  directCount: number;
  maxDepth: number;
  hasCycles: boolean;
}

export const RELATION_MODE_LABEL: Record<GraphRelationMode, string> = {
  all: "All direct",
  incoming: "Incoming",
  outgoing: "Outgoing",
  cycles: "Cycles",
  "blast-radius": "Blast radius",
};

export const RELATION_MODE_ICON: Record<GraphRelationMode, ReactNode> = {
  all: <GitBranch className="size-3.5" />,
  incoming: <ArrowDown className="size-3.5" />,
  outgoing: <ArrowUp className="size-3.5" />,
  cycles: <Search className="size-3.5" />,
  "blast-radius": <Zap className="size-3.5" />,
};

export function getBlastRadiusSummary(
  graphData: ProjectMapGraphResponse,
  nodeId: string | null,
): BlastRadiusSummary | null {
  if (!nodeId) {
    return null;
  }

  const reverseEdgesByTarget = new Map<
    string,
    ProjectMapGraphResponse["edges"]
  >();

  for (const edge of graphData.edges) {
    const items = reverseEdgesByTarget.get(edge.target) ?? [];
    items.push(edge);
    reverseEdgesByTarget.set(edge.target, items);
  }

  const visited = new Set<string>([nodeId]);
  const impactedIds = new Set<string>();
  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId, depth: 0 }];
  let directCount = 0;
  let maxDepth = 0;
  let hasCycles = false;

  while (queue.length > 0) {
    const currentItem = queue.shift();

    if (!currentItem) {
      continue;
    }

    for (const edge of reverseEdgesByTarget.get(currentItem.nodeId) ?? []) {
      if (visited.has(edge.source)) {
        hasCycles = true;
        continue;
      }

      const nextDepth = currentItem.depth + 1;
      visited.add(edge.source);
      impactedIds.add(edge.source);
      directCount += nextDepth === 1 ? 1 : 0;
      maxDepth = Math.max(maxDepth, nextDepth);
      queue.push({ nodeId: edge.source, depth: nextDepth });
    }
  }

  return {
    impactedIds,
    totalCount: impactedIds.size,
    directCount,
    maxDepth,
    hasCycles,
  };
}

export function getParentFolder(folderPath: string | null): string | null {
  if (!folderPath || folderPath === "(root)") {
    return null;
  }

  const segments = folderPath.split("/");

  if (segments.length <= 1) {
    return null;
  }

  return segments.slice(0, -1).join("/");
}

export function getFolderBreadcrumb(folderPath: string | null): string[] {
  if (!folderPath || folderPath === "(root)") {
    return ["Project"];
  }

  return ["Project", ...folderPath.split("/")];
}

export function findGraphNodeById(
  nodes: ProjectMapGraphNode[],
  nodeId: string | null,
) {
  if (!nodeId) return null;
  return nodes.find((node) => node.id === nodeId) ?? null;
}

export function findGraphNodeByPath(
  nodes: ProjectMapGraphNode[],
  path: string | null | undefined,
) {
  if (!path) return null;
  return nodes.find((node) => node.path === path) ?? null;
}
