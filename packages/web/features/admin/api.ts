import { requestApi } from "@/lib/api/client";
import type {
  AdminListUsersQuery,
  AdminOverview,
  AdminUser,
  AdminUserListResponse,
  AdminWorkspaceDetail,
  WorkspacePlan,
} from "@codemap/shared";

export type {
  AdminListUsersQuery,
  AdminOverview,
  AdminUser,
  AdminUserListResponse,
  AdminWorkspaceDetail,
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
