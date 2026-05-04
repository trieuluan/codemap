import { requestApi } from "@/lib/api/client";
import type {
  AdminListUsersQuery,
  AdminOverview,
  AdminUser,
  AdminUserListResponse,
  AdminWorkspaceDetail,
  AdminProject,
  AdminProjectListQuery,
  AdminWorkspaceOption,
  WorkspacePlan,
} from "@codemap/shared";

export type {
  AdminListUsersQuery,
  AdminOverview,
  AdminUser,
  AdminUserListResponse,
  AdminWorkspaceDetail,
  AdminProject,
  AdminProjectListQuery,
  AdminWorkspaceOption,
  WorkspacePlan,
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

export async function listAdminUsers(
  params: Partial<AdminListUsersQuery> = {},
  cookieHeader?: string,
): Promise<AdminUserListResponse> {
  return requestApi<AdminUserListResponse>("/admin/users", {
    cookieHeader,
    queryParams: params,
  });
}

export async function setUserRole(userId: string, role: "admin" | "user"): Promise<void> {
  await requestApi(`/admin/users/${userId}/role`, {
    method: "PATCH",
    body: { role },
  });
}

export async function setWorkspacePlan(
  workspaceId: string,
  plan: WorkspacePlan,
): Promise<void> {
  await requestApi(`/admin/workspaces/${workspaceId}/plan`, {
    method: "PATCH",
    body: { plan },
  });
}

export async function listAdminProjects(
  params?: AdminProjectListQuery,
  cookieHeader?: string,
): Promise<AdminProject[]> {
  return requestApi<AdminProject[]>("/admin/projects", {
    cookieHeader,
    queryParams: params
      ? {
          workspaceId: params.workspaceId,
          ownerUserId: params.ownerUserId,
        }
      : undefined,
  });
}

export async function getAdminProject(
  projectId: string,
  cookieHeader?: string,
): Promise<AdminProject> {
  return requestApi<AdminProject>(`/admin/projects/${projectId}`, {
    cookieHeader,
  });
}

export async function createAdminProject(
  body: {
    name: string;
    workspaceId: string;
    description?: string | null;
    repositoryUrl?: string | null;
    defaultBranch?: string | null;
    visibility?: string;
    provider?: string;
    externalRepoId?: string | null;
  },
): Promise<AdminProject> {
  return requestApi<AdminProject>("/admin/projects", {
    method: "POST",
    body,
  });
}

export async function updateAdminProject(
  projectId: string,
  body: {
    name?: string;
    slug?: string;
    description?: string | null;
    repositoryUrl?: string | null;
    defaultBranch?: string | null;
    visibility?: string;
    provider?: string;
    externalRepoId?: string | null;
  },
): Promise<AdminProject> {
  return requestApi<AdminProject>(`/admin/projects/${projectId}`, {
    method: "PATCH",
    body,
  });
}

export async function deleteAdminProject(
  projectId: string,
): Promise<{ id: string; deleted: boolean }> {
  return requestApi<{ id: string; deleted: boolean }>(`/admin/projects/${projectId}`, {
    method: "DELETE",
  });
}

export async function listAdminWorkspaces(
  cookieHeader?: string,
): Promise<AdminWorkspaceOption[]> {
  const overview = await getAdminOverview(cookieHeader);
  return overview.workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
  }));
}
