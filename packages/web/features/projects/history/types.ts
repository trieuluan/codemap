/**
 * Types for the Project Import History / Compare feature.
 *
 * Some of these (FileDiff, EdgeDiff, SymbolDiff) are computed client-side
 * by diffing two ProjectMapSnapshots, OR fetched from a future
 * `/projects/:id/imports/compare` endpoint. See `./api.ts` for the swap point.
 */

import type { ProjectImport } from "@/features/projects/api";

export type DiffChangeKind = "added" | "removed" | "modified" | "unchanged";

export interface FileDiffEntry {
  path: string;
  change: DiffChangeKind;
  /** Symbol count delta (head - base). null if not available. */
  symbolDelta?: number | null;
  /** Incoming edge count delta (head - base). null if not available. */
  incomingEdgeDelta?: number | null;
}

export interface FileDiffSummary {
  added: FileDiffEntry[];
  removed: FileDiffEntry[];
  modified: FileDiffEntry[];
  totalAdded: number;
  totalRemoved: number;
  totalModified: number;
}

export interface SymbolDiffEntry {
  filePath: string;
  symbolName: string;
  kind: string;
  change: DiffChangeKind;
}

export interface EdgeDiffEntry {
  source: string;
  target: string;
  importKind: string;
  change: "added" | "removed";
}

export interface MetricDelta {
  label: string;
  base: number;
  head: number;
  delta: number;
  /** Format the value for display. Default: locale number. */
  format?: "number" | "percent";
}

export interface ImportComparison {
  base: ProjectImport;
  head: ProjectImport;
  files: FileDiffSummary;
  symbols: SymbolDiffEntry[];
  edges: EdgeDiffEntry[];
  metrics: MetricDelta[];
}
