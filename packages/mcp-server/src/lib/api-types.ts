/** Shared response types for the CodeMap API used across MCP tools. */

export interface Project {
  id: string;
  name: string;
  slug: string;
  provider: "github" | "local_workspace" | null;
  repositoryUrl: string | null;
  localWorkspacePath: string | null;
  status: string;
  defaultBranch: string | null;
}

export interface ProjectImport {
  id: string;
  projectId: string;
  status: string;
  branch: string | null;
  commitSha: string | null;
  parseStatus: string;
  completedAt: string | null;
  errorMessage: string | null;
  parseError: string | null;
}

export interface ProjectSourceImportResult {
  project: Project;
  import: ProjectImport;
}

export interface GithubStatus {
  connected: boolean;
  githubLogin: string | null;
  scope?: string;
  connectedAt?: string;
}

export type ImportStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed";
export type ParseStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "partial";

export interface ProjectImportDetail {
  id: string;
  projectId: string;
  status: ImportStatus;
  parseStatus: ParseStatus;
  branch: string | null;
  commitSha: string | null;
  errorMessage: string | null;
  parseError: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GithubRepository {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
  defaultBranch: string | null;
  private: boolean;
  repositoryUrl: string;
}

export interface TriggerImportResult {
  id: string;
  projectId: string;
  status: ImportStatus;
  branch: string | null;
  createdAt: string;
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

export type FileContentStatus = "ready" | "binary" | "too_large" | "unsupported" | "unavailable";
export type FileContentKind = "text" | "image" | "binary";

export interface FileContent {
  path: string;
  name: string;
  type: "file" | "directory";
  extension: string | null;
  language: string | null;
  kind: FileContentKind;
  mimeType: string | null;
  status: FileContentStatus;
  content: string | null;
  sizeBytes: number | null;
  reason: string | null;
}

export interface SearchFileResult {
  kind: "file";
  path: string;
  language: string | null;
}

export interface SearchSymbolResult {
  kind: "symbol";
  id: string;
  displayName: string;
  symbolKind: string;
  signature: string | null;
  filePath: string;
  parentSymbolName: string | null;
  startLine: number | null;
  startCol: number | null;
}

export interface SearchExportResult {
  kind: "export";
  id: string;
  exportName: string;
  filePath: string;
  symbolId: string | null;
  startLine: number;
  startCol: number;
}

export interface CodebaseSearchResponse {
  files: SearchFileResult[];
  symbols: SearchSymbolResult[];
  exports: SearchExportResult[];
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

export interface EditLocationSuggestion {
  path: string;
  language: string | null;
  confidence: EditLocationConfidence;
  score: number;
  reason: string;
  signals: string[];
  relevantSymbols: EditLocationSymbol[];
  suggestedNextTools: EditLocationNextTool[];
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

// --- Blast Radius ---

export interface BlastRadiusEntry {
  path: string;
  language: string | null;
  depth: number;
  incomingCount: number;
  outgoingCount: number;
}

export interface BlastRadius {
  totalCount: number;
  directCount: number;
  maxDepth: number;
  hasCycles: boolean;
  files: BlastRadiusEntry[];
}

// --- Insights ---

export interface InsightsFileEntry {
  path: string;
  language: string | null;
  incomingCount: number;
  outgoingCount: number;
}

export interface InsightsFolderEntry {
  folder: string;
  sourceFileCount: number;
}

export interface InsightsEntryLikeFile {
  path: string;
  language: string | null;
  incomingCount: number;
  outgoingCount: number;
  score: number;
  reason: string;
}

export interface InsightsCycleCandidate {
  paths: string[];
  edgeCount: number;
  kind: "direct" | "scc";
  summary: string;
}

export interface ProjectInsightsSummary {
  topFilesByImportCount: InsightsFileEntry[];
  topFilesByInboundDependencyCount: InsightsFileEntry[];
  topFoldersBySourceFileCount: InsightsFolderEntry[];
  orphanFiles: InsightsFileEntry[];
  entryLikeFiles: InsightsEntryLikeFile[];
  circularDependencyCandidates: InsightsCycleCandidate[];
  totals: {
    files: number;
    sourceFiles: number;
    parsedFiles: number;
    dependencies: number;
    symbols: number;
  };
}

export interface FileReparseResult {
  reparsed: boolean;
  reason?: "already_fresh";
}

export interface ProjectDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  provider: "github" | "local_workspace" | null;
  status: "draft" | "importing" | "ready" | "failed" | "archived";
  visibility: "private" | "public" | "internal";
  defaultBranch: string | null;
  repositoryUrl: string | null;
  localWorkspacePath: string | null;
  externalRepoId: string | null;
  lastImportedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
