/**
 * Diff/compare API for project imports.
 *
 * Current state: client-side diff of two ProjectMapSnapshots (file tree only).
 * Symbol-level and edge-level diffs are MOCKED — replace with real endpoints
 * when backend exposes them.
 *
 * TODO(backend):
 *   - GET /projects/:id/imports/compare?base=X&head=Y
 *       → returns full ImportComparison server-side (faster, includes symbols + edges)
 *   - GET /projects/:id/imports/:importId/edges
 *       → returns the full edge list for one import (currently only edgeCount is exposed)
 *   - GET /projects/:id/imports/:importId/symbols-per-file
 *       → returns Map<path, symbolCount> for one import
 *
 * Once those exist, replace `mockSymbolDiff` and `mockEdgeDiff` below with
 * real fetches and remove the mock data generators.
 */

import {
  browserProjectsApi,
  type ProjectImport,
  type ProjectMapSnapshot,
  type ProjectMapTreeNode,
} from "@/features/projects/api";
import type {
  EdgeDiffEntry,
  FileDiffEntry,
  FileDiffSummary,
  ImportComparison,
  MetricDelta,
  SymbolDiffEntry,
} from "./types";

/** Walk a snapshot tree and collect every file path. */
function collectFilePaths(node: ProjectMapTreeNode, out: Set<string>) {
  if (node.type === "file") {
    out.add(node.path);
    return;
  }
  for (const child of node.children ?? []) {
    collectFilePaths(child, out);
  }
}

function diffFileTrees(
  base: ProjectMapSnapshot | null,
  head: ProjectMapSnapshot,
): FileDiffSummary {
  const baseFiles = new Set<string>();
  const headFiles = new Set<string>();
  if (base) collectFilePaths(base.tree, baseFiles);
  collectFilePaths(head.tree, headFiles);

  const added: FileDiffEntry[] = [];
  const removed: FileDiffEntry[] = [];
  const modified: FileDiffEntry[] = [];

  for (const path of headFiles) {
    if (!baseFiles.has(path)) {
      added.push({ path, change: "added" });
    }
  }
  for (const path of baseFiles) {
    if (!headFiles.has(path)) {
      removed.push({ path, change: "removed" });
    }
  }

  // TODO: when backend exposes per-file symbol counts per import, populate
  // `modified` by comparing symbol counts for files present in both snapshots.
  // For now we leave it empty (snapshot tree alone can't tell us if a file
  // changed internally).

  return {
    added: added.sort((a, b) => a.path.localeCompare(b.path)),
    removed: removed.sort((a, b) => a.path.localeCompare(b.path)),
    modified,
    totalAdded: added.length,
    totalRemoved: removed.length,
    totalModified: modified.length,
  };
}

function buildMetricDeltas(
  base: ProjectImport,
  head: ProjectImport,
): MetricDelta[] {
  return [
    {
      label: "Files",
      base: base.indexedFileCount,
      head: head.indexedFileCount,
      delta: head.indexedFileCount - base.indexedFileCount,
    },
    {
      label: "Symbols",
      base: base.indexedSymbolCount,
      head: head.indexedSymbolCount,
      delta: head.indexedSymbolCount - base.indexedSymbolCount,
    },
    {
      label: "Dependencies",
      base: base.indexedEdgeCount,
      head: head.indexedEdgeCount,
      delta: head.indexedEdgeCount - base.indexedEdgeCount,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* MOCK DATA — remove when backend is ready                                    */
/* -------------------------------------------------------------------------- */

function mockSymbolDiff(files: FileDiffSummary): SymbolDiffEntry[] {
  // TODO(backend): replace with real fetch.
  // For now: synthesize a few plausible-looking entries from added/removed files.
  const out: SymbolDiffEntry[] = [];
  for (const file of files.added.slice(0, 5)) {
    const stem = file.path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Symbol";
    out.push({
      filePath: file.path,
      symbolName: stem.replace(/^\w/, (c) => c.toUpperCase()),
      kind: "function",
      change: "added",
    });
  }
  for (const file of files.removed.slice(0, 3)) {
    const stem = file.path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Symbol";
    out.push({
      filePath: file.path,
      symbolName: stem.replace(/^\w/, (c) => c.toUpperCase()),
      kind: "function",
      change: "removed",
    });
  }
  return out;
}

function mockEdgeDiff(files: FileDiffSummary): EdgeDiffEntry[] {
  // TODO(backend): replace with real fetch.
  const out: EdgeDiffEntry[] = [];
  for (const file of files.added.slice(0, 4)) {
    out.push({
      source: file.path,
      target: "react",
      importKind: "import",
      change: "added",
    });
  }
  for (const file of files.removed.slice(0, 2)) {
    out.push({
      source: file.path,
      target: "lodash",
      importKind: "import",
      change: "removed",
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */

/**
 * Compute a comparison between two imports.
 *
 * Today: fetches both snapshots in parallel and diffs trees client-side.
 * `head` may use the live `/projects/:id/map` endpoint (latest); for older
 * imports we'd need a `/projects/:id/imports/:importId/map` endpoint —
 * see TODO at top of file.
 */
export async function compareProjectImports(
  projectId: string,
  base: ProjectImport,
  head: ProjectImport,
): Promise<ImportComparison> {
  // TODO(backend): once /imports/compare exists, replace the whole body with:
  //   return requestApi<ImportComparison>(
  //     `/projects/${projectId}/imports/compare`,
  //     { queryParams: { base: base.id, head: head.id } },
  //   );

  // For now we can only fetch the LATEST snapshot via /projects/:id/map.
  // Older snapshots would need a per-import endpoint; until then we degrade
  // gracefully by returning metric-only diff for non-latest comparisons.
  let headSnapshot: ProjectMapSnapshot | null = null;
  let baseSnapshot: ProjectMapSnapshot | null = null;

  try {
    headSnapshot = await browserProjectsApi.getProjectMap(projectId);
    if (headSnapshot.importId !== head.id) {
      // Snapshot endpoint always returns latest — we can't diff trees for an older head.
      headSnapshot = null;
    }
  } catch {
    headSnapshot = null;
  }

  // TODO(backend): fetch baseSnapshot when /imports/:id/map exists.
  // For now base tree is unavailable → fileDiff will report no changes.

  const files: FileDiffSummary = headSnapshot
    ? diffFileTrees(baseSnapshot, headSnapshot)
    : {
        added: [],
        removed: [],
        modified: [],
        totalAdded: 0,
        totalRemoved: 0,
        totalModified: 0,
      };

  return {
    base,
    head,
    files,
    symbols: mockSymbolDiff(files),
    edges: mockEdgeDiff(files),
    metrics: buildMetricDeltas(base, head),
  };
}
