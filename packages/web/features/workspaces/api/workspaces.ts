import { requestApi, type ApiClientOptions } from "@/lib/api/client";
import type {
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceDetail,
  WorkspaceMember,
  WorkspaceUsageSummary,
} from "./workspaces.types";

export function createServerWorkspacesApi(defaults: ApiClientOptions = {}) {
  return {
    listWorkspaces: () =>
      requestApi<Array<{ workspace: Workspace; membership: WorkspaceMember }>>(
        "/workspaces",
        {
          cookieHeader: defaults.cookieHeader,
        },
      ),

    getWorkspace: (workspaceId: string) =>
      requestApi<WorkspaceDetail>(`/workspaces/${workspaceId}`, {
        cookieHeader: defaults.cookieHeader,
      }),

    listMembers: (workspaceId: string) =>
      requestApi<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`, {
        cookieHeader: defaults.cookieHeader,
      }),

    getUsage: (workspaceId: string) =>
      requestApi<WorkspaceUsageSummary>(`/workspaces/${workspaceId}/usage`, {
        cookieHeader: defaults.cookieHeader,
      }),
  };
}

export function browserWorkspacesApi() {
  return {
    ...createServerWorkspacesApi(),

    updateWorkspace: (workspaceId: string, input: UpdateWorkspaceInput) =>
      requestApi<Workspace>(`/workspaces/${workspaceId}`, {
        method: "PATCH",
        body: input,
      }),

    inviteMember: (workspaceId: string, email: string) =>
      requestApi<{ member: WorkspaceMember; user: { id: string; name: string | null; email: string } }>(
        `/workspaces/${workspaceId}/members`,
        { method: "POST", body: { email } },
      ),

    removeMember: (workspaceId: string, memberId: string) =>
      requestApi<{ removed: boolean }>(
        `/workspaces/${workspaceId}/members/${memberId}`,
        { method: "DELETE" },
      ),
  };
}
