"use client";

import useSWR from "swr";
import { GithubConnectCard } from "@/features/github/components/github-connect-card";
import { GitlabConnectCard } from "@/features/gitlab/components/gitlab-connect-card";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { browserWorkspacesApi } from "@/features/workspaces/api";

const api = browserWorkspacesApi();

export default function AccountIntegrationsPage() {
  const { activeWorkspace } = useWorkspace();

  const { data: detail } = useSWR(
    activeWorkspace ? ["integrations-workspace", activeWorkspace.workspace.id] : null,
    ([, workspaceId]) => api.getWorkspace(workspaceId),
    { revalidateOnFocus: false },
  );

  const canConnect = detail?.entitlements.privateRepoImports ?? true;

  return (
    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3 xl:grid-cols-2 lg:grid-cols-2 md:grid-cols-2 sm:grid-cols-1">
      <GithubConnectCard canConnect={canConnect} />
      <GitlabConnectCard canConnect={canConnect} />
    </div>
  );
}
