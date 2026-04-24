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

export interface GithubRepository {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
  defaultBranch: string | null;
  private: boolean;
  repositoryUrl: string;
}
