export type ProjectVisibility = "private" | "public" | "internal";
export type ProjectStatus =
  | "draft"
  | "importing"
  | "ready"
  | "failed"
  | "archived";
export type ProjectProvider = "github" | "local_workspace";
export type ProjectImportStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed";
export type ProjectImportParseStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "partial";
export type ProjectParsedFileStatus =
  | "parsed"
  | "skipped"
  | "too_large"
  | "binary"
  | "unsupported"
  | "error"
  | "unavailable";

export interface ProjectImportParseStats {
  totalFileCount?: number;
  sourceFileCount?: number;
  parsedFileCount?: number;
  dependencyCount?: number;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerUserId: string;
  visibility: ProjectVisibility;
  status: ProjectStatus;
  defaultBranch: string | null;
  repositoryUrl: string | null;
  localWorkspacePath: string | null;
  provider: ProjectProvider | null;
  externalRepoId: string | null;
  lastImportedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectImport {
  id: string;
  projectId: string;
  triggeredByUserId: string;
  status: ProjectImportStatus;
  branch: string | null;
  commitSha: string | null;
  commitMessage?: string | null;
  sourceStorageKey: string | null;
  sourceWorkspacePath: string | null;
  sourceAvailable: boolean;
  parseStatus: ProjectImportParseStatus;
  parseTool: string | null;
  parseToolVersion: string | null;
  parseStartedAt: string | null;
  parseCompletedAt: string | null;
  parseError: string | null;
  indexedFileCount: number;
  indexedSymbolCount: number;
  indexedEdgeCount: number;
  parseStatsJson: ProjectImportParseStats | null;
  ignoreRulesJson: unknown;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectListItem extends Project {
  latestImport?: ProjectImport | null;
}

export interface ProjectMapTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  extension?: string | null;
  children?: ProjectMapTreeNode[];
}

export interface ProjectMapSnapshot {
  id: string;
  projectId: string;
  importId: string;
  tree: ProjectMapTreeNode;
  createdAt: string;
  updatedAt: string;
}

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

export type ProjectFileContentStatus =
  | "ready"
  | "binary"
  | "too_large"
  | "unsupported"
  | "unavailable";
export type ProjectFileContentKind = "text" | "image" | "binary";

export interface ProjectFileContent {
  path: string;
  name: string;
  type: "file" | "directory";
  extension: string | null;
  language: string | null;
  kind: ProjectFileContentKind;
  mimeType: string | null;
  status: ProjectFileContentStatus;
  content: string | null;
  sizeBytes: number | null;
  reason: string | null;
}

export interface ProjectParsedFileDetail {
  fileId: string | null;
  path: string;
  language: string | null;
  lineCount: number | null;
  parseStatus: ProjectParsedFileStatus;
  sizeBytes: number | null;
  mimeType: string | null;
  extension: string | null;
  importParseStatus: ProjectImportParseStatus;
}

export interface ProjectFileSymbol {
  id: string;
  displayName: string;
  kind: string;
  signature: string | null;
  isExported: boolean;
  parentSymbolName: string | null;
  startLine: number | null;
  startCol: number | null;
  endLine: number | null;
  endCol: number | null;
}

export interface ProjectFileImportEdge {
  id: string;
  moduleSpecifier: string;
  importKind: string;
  isResolved: boolean;
  resolutionKind: string;
  targetPathText: string | null;
  targetExternalSymbolKey: string | null;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface ProjectFileIncomingImportEdge {
  id: string;
  sourceFileId: string;
  sourceFilePath: string;
  moduleSpecifier: string;
  importKind: string;
  resolutionKind: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface ProjectFileExport {
  id: string;
  symbolId: string | null;
  exportName: string;
  exportKind: string;
  symbolDisplayName: string | null;
  sourceModuleSpecifier: string | null;
  symbolStartLine: number | null;
  symbolStartCol: number | null;
  symbolEndLine: number | null;
  symbolEndCol: number | null;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface ProjectFileBlastRadiusEntry {
  path: string;
  language: string | null;
  depth: number;
  incomingCount: number;
  outgoingCount: number;
}

export interface ProjectFileBlastRadius {
  totalCount: number;
  directCount: number;
  maxDepth: number;
  hasCycles: boolean;
  files: ProjectFileBlastRadiusEntry[];
}

export interface ProjectInsightCycleCandidate {
  paths: string[];
  edgeCount: number;
  kind: "direct" | "scc";
  summary: string;
}

export interface ProjectFileParseData {
  file: ProjectParsedFileDetail;
  imports: ProjectFileImportEdge[];
  importedBy: ProjectFileIncomingImportEdge[];
  exports: ProjectFileExport[];
  symbols: ProjectFileSymbol[];
  blastRadius: ProjectFileBlastRadius;
  cycles: ProjectInsightCycleCandidate[];
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

export interface ProjectMapTotals {
  files: number;
  sourceFiles: number;
  parsedFiles: number;
  dependencies: number;
  symbols: number;
}

export interface ProjectMapInsightsResponse {
  topFilesByImportCount: ProjectInsightFileEntry[];
  topFilesByInboundDependencyCount: ProjectInsightFileEntry[];
  topFoldersBySourceFileCount: ProjectInsightFolderEntry[];
  orphanFiles: ProjectInsightFileEntry[];
  entryLikeFiles: ProjectInsightEntryLikeFile[];
  circularDependencyCandidates: ProjectInsightCycleCandidate[];
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

export interface ProjectSourceImportResult {
  project: Project;
  import: ProjectImport;
}

export type EditLocationConfidence = "high" | "medium" | "low";

export type EditLocationNextTool =
  | "get_file"
  | "find_usages"
  | "find_callers"
  | "get_project_map";

export interface EditLocationSymbol {
  id: string;
  name: string;
  kind: string;
  startLine: number | null;
  endLine: number | null;
}

export type EditLocationReadInclude = "outline" | "symbols" | "content";

export interface EditLocationReadPlan {
  include: EditLocationReadInclude[];
  symbolNames?: string[];
  startLine?: number;
  endLine?: number;
}

export interface EditLocationSuggestion {
  path: string;
  language: string | null;
  confidence: EditLocationConfidence;
  score: number;
  reason: string;
  signals: string[];
  relevantSymbols: EditLocationSymbol[];
  suggestedNextTools: EditLocationNextTool[];
  readPlan: EditLocationReadPlan;
}

export interface EditLocationsResponse {
  query: string;
  projectId: string;
  importId: string;
  suggestions: EditLocationSuggestion[];
  meta: {
    source: "deterministic_search_and_graph";
    staleness: "latest_import";
  };
}

export type SymbolUsageConfidence =
  | "definite"
  | "probable"
  | "potential"
  | "text_only";

export interface SymbolUsageRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface SymbolUsageTarget {
  id: string;
  displayName: string;
  symbolKind: string;
  signature: string | null;
  fileId: string | null;
  filePath: string | null;
  parentSymbolId?: string | null;
  parentSymbolName: string | null;
  isExported: boolean;
  isDefaultExport: boolean;
  range: SymbolUsageRange | null;
}

export interface SymbolOccurrenceUsage {
  id: string;
  fileId: string;
  filePath: string;
  role: string;
  range: SymbolUsageRange;
  syntaxKind: string | null;
  snippetPreview: string | null;
  confidence: SymbolUsageConfidence;
}

export interface SymbolCaller {
  fileId: string;
  filePath: string;
  evidence:
    | "symbol_relationship"
    | "named_import"
    | "namespace_or_wildcard_import"
    | "occurrence";
  relationshipKind?: string;
  importKind?: string;
  moduleSpecifier?: string;
  importedNames?: string[];
  occurrenceRole?: string;
  range: SymbolUsageRange | null;
  confidence: SymbolUsageConfidence;
  snippetPreview?: string | null;
}

export interface SymbolUsagesResponse {
  target: SymbolUsageTarget;
  definitions: SymbolOccurrenceUsage[];
  usages: SymbolOccurrenceUsage[];
  callers: SymbolCaller[];
  totals: {
    definitions: number;
    usages: number;
    callers: number;
  };
  meta: {
    projectImportId: string;
    projectId?: string;
    mapSnapshotId?: string;
    importStatus?: string;
    parseStatus?: string;
    parsedAt?: string | null;
    source: string;
    staleness: string;
  };
}

export interface FileReparseResult {
  reparsed: boolean;
  reason?: "already_fresh";
}
