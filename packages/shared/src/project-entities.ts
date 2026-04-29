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

export interface ProjectSourceImportResult {
  project: Project;
  import: ProjectImport;
}
