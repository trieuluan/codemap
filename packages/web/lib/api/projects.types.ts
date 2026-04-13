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

export interface ProjectFileContent {
  path: string;
  name: string;
  type: "file" | "directory";
  extension: string | null;
  language: string | null;
  status: ProjectFileContentStatus;
  content: string | null;
  sizeBytes: number | null;
  reason: string | null;
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
