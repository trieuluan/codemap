import { requestApi } from "@/lib/api/client";

export type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  systemRoles: string[];
  workspaces: Array<{
    id: string;
    name: string;
    plan: string;
    role: string;
  }>;
};

export type AdminOverview = {
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
    type: "personal" | "team";
    plan: "beta" | "developer" | "team";
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
      plan: string;
      provider: string;
    };
    updatedAt: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    provider: string | null;
    visibility: string;
    workspaceId: string;
    workspaceName: string;
    latestImport: null | {
      id: string;
      status: string;
      parseStatus: string;
      commitSha: string | null;
      indexedFileCount: number;
      indexedSymbolCount: number;
      indexedEdgeCount: number;
      completedAt: string | null;
    };
    updatedAt: string;
  }>;
  imports: Array<{
    id: string;
    projectId: string;
    projectName: string;
    workspaceId: string;
    workspaceName: string;
    triggeredBy: {
      id: string;
      name: string | null;
      email: string;
    };
    status: string;
    parseStatus: string;
    branch: string | null;
    commitSha: string | null;
    indexedFileCount: number;
    indexedSymbolCount: number;
    indexedEdgeCount: number;
    startedAt: string;
    completedAt: string | null;
  }>;
  subscriptions: Array<{
    id: string;
    workspaceId: string;
    workspaceName: string;
    plan: string;
    provider: string;
    status: string;
    currentPeriodEnd: string | null;
    updatedAt: string;
  }>;
  payments: Array<{
    id: string;
    workspaceId: string;
    workspaceName: string;
    provider: string;
    amount: string | null;
    currency: string;
    status: string;
    plan: string;
    createdAt: string;
  }>;
};

export type AdminWorkspaceDetail = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    type: "personal" | "team";
    plan: "beta" | "developer" | "team";
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
    role: string;
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
    status: string;
    provider: string | null;
    visibility: string;
    repositoryUrl: string | null;
    latestImport: null | {
      id: string;
      status: string;
      parseStatus: string;
      commitSha: string | null;
      indexedFileCount: number;
      indexedSymbolCount: number;
      indexedEdgeCount: number;
      completedAt: string | null;
    };
    updatedAt: string;
  }>;
  subscriptions: Array<{
    id: string;
    plan: string;
    provider: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelledAt: string | null;
    updatedAt: string;
  }>;
  payments: Array<{
    id: string;
    provider: string;
    amount: string | null;
    currency: string;
    status: string;
    plan: string;
    createdAt: string;
  }>;
};

export async function getAdminOverview(cookieHeader?: string): Promise<AdminOverview> {
  return requestApi<AdminOverview>("/admin/overview", { cookieHeader });
}

export async function getAdminWorkspace(
  workspaceId: string,
  cookieHeader?: string,
): Promise<AdminWorkspaceDetail> {
  return requestApi<AdminWorkspaceDetail>(`/admin/workspaces/${workspaceId}`, {
    cookieHeader,
  });
}

export async function listAdminUsers(cookieHeader?: string): Promise<AdminUser[]> {
  const res = await requestApi<AdminUser[]>("/admin/users", { cookieHeader });
  return res;
}

export async function setUserRole(userId: string, role: "admin" | "user"): Promise<void> {
  await requestApi(`/admin/users/${userId}/role`, {
    method: "PATCH",
    body: { role },
  });
}

export async function setWorkspacePlan(workspaceId: string, plan: string): Promise<void> {
  await requestApi(`/admin/workspaces/${workspaceId}/plan`, {
    method: "PATCH",
    body: { plan },
  });
}
