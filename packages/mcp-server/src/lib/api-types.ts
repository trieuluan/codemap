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

export type ImportStatus = "pending" | "running" | "completed" | "failed";
export type ParseStatus = "pending" | "running" | "completed" | "failed" | "partial";

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
