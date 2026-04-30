import type { ProjectParsedFileStatus } from "./project-entities";
import type { ProjectInsightCycleCandidate } from "./project-file";

export type ProjectImportCompareChange = "added" | "removed" | "modified";

export interface ProjectImportFileDiffEntry {
  path: string;
  change: ProjectImportCompareChange;
  language: string | null;
  extension: string | null;
  sizeBytes: number | null;
  lineCount: number | null;
  parseStatus: ProjectParsedFileStatus;
}

export interface ProjectImportFileDiff {
  added: ProjectImportFileDiffEntry[];
  removed: ProjectImportFileDiffEntry[];
  modified: ProjectImportFileDiffEntry[];
  totalAdded: number;
  totalRemoved: number;
  totalModified: number;
}

export interface ProjectImportSymbolDiffEntry {
  filePath: string | null;
  symbolName: string;
  kind: string;
  change: Exclude<ProjectImportCompareChange, "modified">;
}

export interface ProjectImportEdgeDiffEntry {
  source: string;
  target: string;
  moduleSpecifier: string;
  importKind: string;
  importedNames: string[];
  isTypeOnly: boolean;
  isResolved: boolean;
  resolutionKind: string;
  startLine: number;
  startCol: number;
  change: Exclude<ProjectImportCompareChange, "modified">;
}

export interface ProjectImportMetricDelta {
  label: "Files" | "Symbols" | "Dependencies";
  base: number;
  head: number;
  delta: number;
}

export interface ProjectImportComparison {
  baseImportId: string;
  headImportId: string;
  files: ProjectImportFileDiff;
  symbols: ProjectImportSymbolDiffEntry[];
  edges: ProjectImportEdgeDiffEntry[];
  metrics: ProjectImportMetricDelta[];
}

export interface ProjectMapTotals {
  files: number;
  sourceFiles: number;
  parsedFiles: number;
  dependencies: number;
  symbols: number;
}

export interface ProjectInsightFileEntry {
  path: string;
  language: string | null;
  incomingCount: number;
  outgoingCount: number;
}

export interface ProjectInsightFolderEntry {
  folder: string;
  sourceFileCount: number;
}

export interface ProjectInsightEntryLikeFile extends ProjectInsightFileEntry {
  score: number;
  reason: string;
}

export interface ProjectInsightLanguageEntry {
  language: string;
  fileCount: number;
}

export interface ProjectInsightParseStatusEntry {
  status: ProjectParsedFileStatus;
  fileCount: number;
}

export interface ProjectInsightFocusedEdgeFile extends ProjectInsightFileEntry {
  moduleSpecifier: string;
  importKind: string;
  importedNames: string[];
  isTypeOnly: boolean;
  isResolved: boolean;
  resolutionKind: string;
}

export interface ProjectInsightFocusedFile extends ProjectInsightFileEntry {
  symbolName: string | null;
  isOrphan: boolean;
  isEntryLike: boolean;
  entryLikeScore: number | null;
  entryLikeReason: string | null;
  cycles: ProjectInsightCycleCandidate[];
  directImporters: ProjectInsightFocusedEdgeFile[];
  directDependencies: ProjectInsightFocusedEdgeFile[];
}

export type ProjectInsightRecommendationSeverity = "info" | "warning" | "critical";
export type ProjectInsightRecommendationAction =
  | "review_cycles"
  | "inspect_high_fan_out"
  | "inspect_orphans"
  | "review_parse_quality"
  | "inspect_focused_file"
  | "review_focused_orphan"
  | "review_focused_entry"
  | "review_focused_cycle"
  | "inspect_focused_fan_out"
  | "inspect_focused_dependents";

export interface ProjectInsightRecommendation {
  id: string;
  title: string;
  description: string;
  severity: ProjectInsightRecommendationSeverity;
  action: ProjectInsightRecommendationAction;
  href: string | null;
}

export interface ProjectMapInsightsResponse {
  topFilesByImportCount: ProjectInsightFileEntry[];
  topFilesByInboundDependencyCount: ProjectInsightFileEntry[];
  topFoldersBySourceFileCount: ProjectInsightFolderEntry[];
  orphanFiles: ProjectInsightFileEntry[];
  entryLikeFiles: ProjectInsightEntryLikeFile[];
  circularDependencyCandidates: ProjectInsightCycleCandidate[];
  languageDistribution: ProjectInsightLanguageEntry[];
  parseStatusBreakdown: ProjectInsightParseStatusEntry[];
  unresolvedImportCount: number;
  externalImportCount: number;
  focusedFile: ProjectInsightFocusedFile | null;
  recommendations: ProjectInsightRecommendation[];
  totals: ProjectMapTotals;
}

export interface ProjectAnalysisSummaryFileEntry {
  path: string;
  outgoingCount: number;
  incomingCount: number;
}

export interface ProjectAnalysisSummaryFolderEntry {
  folder: string;
  sourceFileCount: number;
}

export interface ProjectAnalysisSummaryLanguageEntry {
  language: string;
  fileCount: number;
}

export interface ProjectAnalysisSummary {
  topFilesByDependencies: ProjectAnalysisSummaryFileEntry[];
  topFolders: ProjectAnalysisSummaryFolderEntry[];
  sourceFileDistribution: ProjectAnalysisSummaryLanguageEntry[];
  totals: ProjectMapTotals;
}

export interface ProjectMapSearchFileResult {
  kind: "file";
  path: string;
  language: string | null;
}

export interface ProjectMapSearchSymbolResult {
  kind: "symbol";
  id: string;
  displayName: string;
  symbolKind: string;
  signature?: string | null;
  filePath: string;
  parentSymbolName: string | null;
  startLine: number | null;
  startCol: number | null;
  endLine?: number | null;
  endCol?: number | null;
}

export interface ProjectMapSearchExportResult {
  kind: "export";
  id: string;
  exportName: string;
  filePath: string;
  symbolId: string | null;
  symbolStartLine?: number | null;
  symbolStartCol?: number | null;
  symbolEndLine?: number | null;
  symbolEndCol?: number | null;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface ProjectMapSearchResponse {
  files: ProjectMapSearchFileResult[];
  symbols: ProjectMapSearchSymbolResult[];
  exports: ProjectMapSearchExportResult[];
}

export interface ProjectMapGraphNode {
  id: string;
  path: string;
  language: string | null;
  dirPath: string;
  incomingCount: number;
  outgoingCount: number;
  isParseable: boolean;
}

export interface ProjectMapGraphEdge {
  id: string;
  source: string;
  target: string;
  importKind: string;
  isResolved: boolean;
  resolutionKind: string;
}

export interface ProjectMapGraphCycle {
  kind: "direct" | "scc";
  paths: string[];
  nodeIds: string[];
}

export interface ProjectMapGraphFolderNode {
  id: string;
  folder: string;
  fileCount: number;
  sourceFileCount: number;
  incomingCount: number;
  outgoingCount: number;
  internalEdgeCount: number;
}

export interface ProjectMapGraphFolderEdge {
  id: string;
  source: string;
  target: string;
  edgeCount: number;
}

export interface ProjectMapGraphResponse {
  nodes: ProjectMapGraphNode[];
  edges: ProjectMapGraphEdge[];
  cycles: ProjectMapGraphCycle[];
  folderNodes: ProjectMapGraphFolderNode[];
  folderEdges: ProjectMapGraphFolderEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    cycleCount: number;
    folderCount: number;
    folderEdgeCount: number;
  };
}
