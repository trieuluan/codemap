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
