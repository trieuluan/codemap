export type WorkspaceType = "personal" | "team";
export type WorkspacePlan = "beta" | "developer" | "team";
export type WorkspaceRole = "owner" | "admin" | "member";
export type UsageEventType =
  | "project_created"
  | "import_triggered"
  | "parse_completed"
  | "mcp_session_created";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
  ownerUserId: string;
  plan: WorkspacePlan;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

export interface WorkspaceEntitlements {
  plan: WorkspacePlan;
  maxProjects: number | null;
  maxImportsPerMonth: number | null;
  maxIndexedFilesPerImport: number | null;
  privateRepoImports: boolean;
  mcpAccess: boolean;
  teamMembers: boolean;
}

export interface WorkspaceUsageSummary {
  projectCount: number;
  importsThisMonth: number;
  indexedFilesThisMonth: number;
  indexedSymbolsThisMonth: number;
  indexedEdgesThisMonth: number;
  mcpSessionsCreatedThisMonth: number;
}

export interface WorkspaceDetail {
  workspace: Workspace;
  membership: WorkspaceMember;
  entitlements: WorkspaceEntitlements;
  usage: WorkspaceUsageSummary;
}
