import type {
  ProjectMapGraphCycle,
  ProjectMapGraphEdge,
  ProjectMapGraphNode,
} from "@/features/projects/api";
export { getFileName } from "../utils/graph-utils";

export function getResolutionLabel(kind: string) {
  switch (kind) {
    case "relative_path":
      return "Internal";
    case "tsconfig_alias":
      return "Alias";
    case "package":
      return "Package";
    case "builtin":
      return "Builtin";
    case "unresolved":
      return "Unresolved";
    default:
      return kind.replace(/_/g, " ");
  }
}

export function getResolutionClassName(kind: string) {
  switch (kind) {
    case "relative_path":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400";
    case "tsconfig_alias":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-400";
    case "package":
      return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400";
    case "builtin":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400";
    case "unresolved":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-foreground";
  }
}

export function buildCycleExplanationSteps(
  cycle: ProjectMapGraphCycle,
  nodes: ProjectMapGraphNode[],
  edges: ProjectMapGraphEdge[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const cycleNodeIds = new Set(cycle.nodeIds);
  const outgoingEdges = new Map<string, ProjectMapGraphEdge[]>();

  for (const edge of edges) {
    if (!cycleNodeIds.has(edge.source) || !cycleNodeIds.has(edge.target)) {
      continue;
    }

    const items = outgoingEdges.get(edge.source) ?? [];
    items.push(edge);
    outgoingEdges.set(edge.source, items);
  }

  if (cycle.kind === "direct" && cycle.nodeIds.length === 2) {
    const [firstId, secondId] = cycle.nodeIds;
    const firstToSecond = outgoingEdges
      .get(firstId)
      ?.find((edge) => edge.target === secondId);
    const secondToFirst = outgoingEdges
      .get(secondId)
      ?.find((edge) => edge.target === firstId);

    if (firstId && secondId && firstToSecond && secondToFirst) {
      return [firstToSecond, secondToFirst].map((edge) => ({
        sourcePath: nodeById.get(edge.source)?.path ?? edge.source,
        targetPath: nodeById.get(edge.target)?.path ?? edge.target,
        importKind: edge.importKind,
        resolutionKind: edge.resolutionKind,
      }));
    }
  }

  const startId = cycle.nodeIds[0];

  if (!startId) {
    return [];
  }

  const visited = new Set<string>([startId]);
  const pathEdges: ProjectMapGraphEdge[] = [];

  function findCyclePath(currentId: string): boolean {
    for (const edge of outgoingEdges.get(currentId) ?? []) {
      if (edge.target === startId && pathEdges.length > 0) {
        pathEdges.push(edge);
        return true;
      }

      if (visited.has(edge.target)) {
        continue;
      }

      visited.add(edge.target);
      pathEdges.push(edge);

      if (findCyclePath(edge.target)) {
        return true;
      }

      pathEdges.pop();
      visited.delete(edge.target);
    }

    return false;
  }

  if (!findCyclePath(startId)) {
    return [];
  }

  return pathEdges.map((edge) => ({
    sourcePath: nodeById.get(edge.source)?.path ?? edge.source,
    targetPath: nodeById.get(edge.target)?.path ?? edge.target,
    importKind: edge.importKind,
    resolutionKind: edge.resolutionKind,
  }));
}
