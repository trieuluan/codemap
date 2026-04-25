import type { RepoSymbolOccurrenceRole } from "../../../../db/schema/repo-parse-schema";
import type { ProjectImportEdge } from "../types/repo-parse-graph.types";

export const MONOREPO_ROOT_SEGMENTS = new Set(["packages", "apps", "libs", "services"]);

export function toPathBaseName(filePath: string) {
  const lastSegment = filePath.split("/").pop() ?? filePath;
  return lastSegment.replace(/\.[^.]+$/, "");
}

export function toTopLevelFolder(filePath: string, monorepoAware = false) {
  if (!filePath.includes("/")) {
    return "(root)";
  }

  const parts = filePath.split("/");
  const first = parts[0] || "(root)";

  if (monorepoAware && MONOREPO_ROOT_SEGMENTS.has(first) && parts[1]) {
    return `${first}/${parts[1]}`;
  }

  return first;
}

export function buildEntryLikeReason(
  baseName: string,
  path: string,
  outgoingCount: number,
  incomingCount: number,
) {
  const reasons: string[] = [];

  if (["main", "app", "server", "cli", "worker", "entry", "bootstrap"].includes(baseName)) {
    reasons.push(`entry-style filename: ${baseName}`);
  } else if (baseName === "index") {
    reasons.push("high-signal index file");
  }

  const pathParts = path.split("/");
  const isMonorepoSrc =
    MONOREPO_ROOT_SEGMENTS.has(pathParts[0] ?? "") &&
    pathParts[2] === "src" &&
    pathParts.length === 4;

  if (!path.includes("/")) {
    reasons.push("root-level file");
  } else if (path.startsWith("src/") || path.startsWith("app/") || isMonorepoSrc) {
    reasons.push("top-level source path");
  }

  if (outgoingCount >= 5) {
    reasons.push("high outgoing dependency count");
  } else if (outgoingCount >= 3) {
    reasons.push("multiple internal dependencies");
  }

  if (incomingCount === 0) {
    reasons.push("not imported by other internal files");
  }

  return reasons.join(" · ");
}

export const OCCURRENCE_PRIORITY = new Map<RepoSymbolOccurrenceRole, number>([
  ["definition", 0],
  ["declaration", 1],
  ["export", 2],
  ["import", 3],
  ["type_reference", 4],
  ["reference", 5],
]);

export function pickBestOccurrence<T extends { symbolId: string | null; occurrenceRole: RepoSymbolOccurrenceRole }>(
  occurrences: T[],
): Map<string, T> {
  const best = new Map<string, T>();

  for (const occurrence of occurrences) {
    if (!occurrence.symbolId) continue;

    const current = best.get(occurrence.symbolId);
    if (!current) {
      best.set(occurrence.symbolId, occurrence);
      continue;
    }

    const currentPriority = OCCURRENCE_PRIORITY.get(current.occurrenceRole) ?? Number.MAX_SAFE_INTEGER;
    const nextPriority = OCCURRENCE_PRIORITY.get(occurrence.occurrenceRole) ?? Number.MAX_SAFE_INTEGER;

    if (nextPriority < currentPriority) {
      best.set(occurrence.symbolId, occurrence);
    }
  }

  return best;
}

export function toImportEdge(
  edge: {
    id: string;
    projectImportId: string;
    sourceFileId: string;
    sourceFile: { path: string };
    targetFileId: string | null;
    targetFile: { path: string } | null;
    targetPathText: string | null;
    targetExternalSymbolKey: string | null;
    moduleSpecifier: string;
    importKind: ProjectImportEdge["importKind"];
    isTypeOnly: boolean;
    isResolved: boolean;
    resolutionKind: ProjectImportEdge["resolutionKind"];
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
    extraJson: unknown;
    createdAt: Date;
  },
): ProjectImportEdge {
  return {
    id: edge.id,
    projectImportId: edge.projectImportId,
    sourceFileId: edge.sourceFileId,
    sourceFilePath: edge.sourceFile.path,
    targetFileId: edge.targetFileId,
    targetFilePath: edge.targetFile?.path ?? null,
    targetPathText: edge.targetPathText,
    targetExternalSymbolKey: edge.targetExternalSymbolKey,
    moduleSpecifier: edge.moduleSpecifier,
    importKind: edge.importKind,
    isTypeOnly: edge.isTypeOnly,
    isResolved: edge.isResolved,
    resolutionKind: edge.resolutionKind,
    startLine: edge.startLine,
    startCol: edge.startCol,
    endLine: edge.endLine,
    endCol: edge.endCol,
    extraJson: edge.extraJson,
    createdAt: edge.createdAt,
  };
}

export function tarjanSCC(
  nodeIds: string[],
  adjacency: Map<string, Set<string>>,
): string[][] {
  const visitedIndices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const stackSet = new Set<string>();
  let index = 0;
  const sccs: string[][] = [];

  const strongConnect = (nodeId: string) => {
    visitedIndices.set(nodeId, index);
    lowLinks.set(nodeId, index);
    index += 1;
    stack.push(nodeId);
    stackSet.add(nodeId);

    for (const neighborId of adjacency.get(nodeId) ?? []) {
      if (!visitedIndices.has(neighborId)) {
        strongConnect(neighborId);
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId) ?? 0, lowLinks.get(neighborId) ?? 0));
      } else if (stackSet.has(neighborId)) {
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId) ?? 0, visitedIndices.get(neighborId) ?? 0));
      }
    }

    if (lowLinks.get(nodeId) === visitedIndices.get(nodeId)) {
      const component: string[] = [];
      let curr: string | undefined;
      do {
        curr = stack.pop();
        if (!curr) break;
        stackSet.delete(curr);
        component.push(curr);
      } while (curr !== nodeId);
      if (component.length > 1) sccs.push(component);
    }
  };

  for (const id of nodeIds) {
    if (!visitedIndices.has(id)) strongConnect(id);
  }

  return sccs;
}
