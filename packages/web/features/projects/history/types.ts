/**
 * Types for the Project Import History / Compare feature.
 *
 * Import compare data is computed by `/projects/:id/imports/compare`.
 * The web layer builds presentation-only views from this payload.
 */

import type {
  ProjectImport,
  ProjectImportCompareChange,
  ProjectImportFileDiff,
  ProjectImportFileDiffEntry,
  ProjectImportMetricDelta,
  ProjectImportSymbolDiffEntry,
  ProjectImportEdgeDiffEntry,
} from "@/features/projects/api";

export type DiffChangeKind = ProjectImportCompareChange;

export type FileDiffEntry = ProjectImportFileDiffEntry;
export type FileDiffSummary = ProjectImportFileDiff;
export type SymbolDiffEntry = ProjectImportSymbolDiffEntry;
export type EdgeDiffEntry = ProjectImportEdgeDiffEntry;
export type MetricDelta = ProjectImportMetricDelta;

export interface ImportComparison {
  base: ProjectImport;
  head: ProjectImport;
  files: FileDiffSummary;
  symbols: SymbolDiffEntry[];
  edges: EdgeDiffEntry[];
  metrics: MetricDelta[];
}
