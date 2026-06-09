import { z } from "zod";
import type {
  ProjectImportParseStatus,
  ProjectImportStatus,
  ProjectProvider,
  ProjectStatus,
  ProjectVisibility,
} from "./project-entities.js";
import type { WorkspacePlan, WorkspaceRole, WorkspaceType } from "./workspace.js";

export const adminListUsersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(10),
});

export const adminListProjectImportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(15),
});

export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;
export type AdminListProjectImportsQuery = z.infer<typeof adminListProjectImportsQuerySchema>;

export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  systemRoles: string[];
  workspaces: Array<{
    id: string;
    name: string;
    plan: WorkspacePlan;
    role: WorkspaceRole;
  }>;
}

export interface AdminUserListResponse {
  items: AdminUser[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminOverview {
  stats: {
    users: number;
    workspaces: number;
    projects: number;
    imports: number;
    activeSubscriptions: number;
  };
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    type: WorkspaceType;
    plan: WorkspacePlan;
    owner: {
      id: string;
      name: string | null;
      email: string;
    };
    memberCount: number;
    projectCount: number;
    activeSubscription: null | {
      id: string;
      status: string;
      plan: WorkspacePlan;
      provider: string;
    };
    updatedAt: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    slug: string;
    status: ProjectStatus;
    provider: ProjectProvider | null;
    visibility: ProjectVisibility;
    workspaceId: string;
    workspaceName: string;
    latestImport: null | AdminProjectImportSummary;
    updatedAt: string;
  }>;
  imports: Array<AdminImportActivity>;
  subscriptions: Array<{
    id: string;
    workspaceId: string;
    workspaceName: string;
    plan: WorkspacePlan;
    provider: string;
    status: string;
    currentPeriodEnd: string | null;
    updatedAt: string;
  }>;
  payments: Array<AdminPaymentSummary>;
}

export interface AdminWorkspaceDetail {
  workspace: {
    id: string;
    name: string;
    slug: string;
    type: WorkspaceType;
    plan: WorkspacePlan;
    owner: {
      id: string;
      name: string | null;
      email: string;
    };
    createdAt: string;
    updatedAt: string;
  };
  members: Array<{
    userId: string;
    role: WorkspaceRole;
    createdAt: string;
    user: {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
    };
  }>;
  projects: Array<{
    id: string;
    name: string;
    slug: string;
    status: ProjectStatus;
    provider: ProjectProvider | null;
    visibility: ProjectVisibility;
    repositoryUrl: string | null;
    latestImport: null | AdminProjectImportSummary;
    updatedAt: string;
  }>;
  subscriptions: Array<{
    id: string;
    plan: WorkspacePlan;
    provider: string;
    providerSubscriptionId: string | null;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelledAt: string | null;
    updatedAt: string;
  }>;
  payments: AdminPaymentSummary[];
}

export interface AdminProjectImportSummary {
  id: string;
  status: ProjectImportStatus;
  parseStatus: ProjectImportParseStatus;
  commitSha: string | null;
  indexedFileCount: number;
  indexedSymbolCount: number;
  indexedEdgeCount: number;
  completedAt: string | null;
}

export interface AdminProjectImportsResponse<TImport = unknown> {
  items: TImport[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminImportActivity extends AdminProjectImportSummary {
  projectId: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
  triggeredBy: {
    id: string;
    name: string | null;
    email: string;
  };
  branch: string | null;
  startedAt: string;
}

export interface AdminPaymentSummary {
  id: string;
  workspaceId: string;
  workspaceName: string;
  provider: string;
  amount: string | null;
  currency: string;
  status: string;
  plan: WorkspacePlan;
  createdAt: string;
}

export interface AdminProject {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerUserId: string;
  workspaceId: string;
  visibility: string;
  status: string;
  defaultBranch: string | null;
  repositoryUrl: string | null;
  localWorkspacePath: string | null;
  provider: string | null;
  externalRepoId: string | null;
  createdAt: string;
  updatedAt: string;
  latestImport: null | AdminProjectImportSummary;
}

export interface AdminProjectListQuery {
  workspaceId?: string;
  ownerUserId?: string;
}

// Admin workspace list response for dropdown in create/edit dialogs
export interface AdminWorkspaceOption {
  id: string;
  name: string;
  slug: string;
}
