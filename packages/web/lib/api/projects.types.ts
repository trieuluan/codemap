export type ProjectVisibility = "private" | "public" | "internal";
export type ProjectStatus =
  | "draft"
  | "importing"
  | "ready"
  | "failed"
  | "archived";
export type ProjectProvider = "github";
export type ProjectImportStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";
export type ProjectImportParseStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "partial";

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

export type ProjectListInclude = "latestImport";

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

export type ProjectParsedFileStatus =
  | "parsed"
  | "skipped"
  | "too_large"
  | "binary"
  | "unsupported"
  | "error"
  | "unavailable";

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

export interface ProjectFileExport {
  id: string;
  exportName: string;
  exportKind: string;
  symbolDisplayName: string | null;
  sourceModuleSpecifier: string | null;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface ProjectFileParseData {
  file: ProjectParsedFileDetail;
  imports: ProjectFileImportEdge[];
  exports: ProjectFileExport[];
  symbols: ProjectFileSymbol[];
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
  totals: {
    files: number;
    sourceFiles: number;
    parsedFiles: number;
    dependencies: number;
    symbols: number;
  };
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  defaultBranch?: string | null;
  repositoryUrl?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  defaultBranch?: string | null;
  repositoryUrl?: string | null;
}

export interface TriggerProjectImportInput {
  branch?: string;
}
