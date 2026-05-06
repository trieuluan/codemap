"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import useSWR from "swr";
import { browserWorkspacesApi } from "./api";
import type { Workspace, WorkspaceMember } from "./api/workspaces.types";

const STORAGE_KEY = "codemap:active-workspace";

interface WorkspaceRow {
  workspace: Workspace;
  membership: WorkspaceMember;
}

interface WorkspaceContextValue {
  workspaces: WorkspaceRow[];
  activeWorkspace: WorkspaceRow | null;
  isLoading: boolean;
  switchWorkspace: (workspaceId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaces: [],
  activeWorkspace: null,
  isLoading: true,
  switchWorkspace: () => {},
});

const api = browserWorkspacesApi();

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: workspaces = [], isLoading } = useSWR(
    "workspace-list",
    () => api.listWorkspaces(),
    { revalidateOnFocus: false },
  );

  // Derive activeId from URL first, then localStorage, then first workspace
  useEffect(() => {
    if (workspaces.length === 0) return;

    // Extract workspaceId from /w/[workspaceId]/... pattern
    const urlMatch = pathname.match(/^\/w\/([^/]+)/);
    const urlWorkspaceId = urlMatch?.[1] ?? null;

    if (urlWorkspaceId && workspaces.some((w) => w.workspace.id === urlWorkspaceId)) {
      setActiveId(urlWorkspaceId);
      localStorage.setItem(STORAGE_KEY, urlWorkspaceId);
      return;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    const valid = workspaces.find((w) => w.workspace.id === stored);
    setActiveId(valid ? stored : workspaces[0].workspace.id);
  }, [workspaces, pathname]);

  const switchWorkspace = useCallback((workspaceId: string) => {
    localStorage.setItem(STORAGE_KEY, workspaceId);
    setActiveId(workspaceId);
    router.push(`/w/${workspaceId}/dashboard`);
  }, [router]);

  const activeWorkspace =
    workspaces.find((w) => w.workspace.id === activeId) ?? workspaces[0] ?? null;

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspace, isLoading, switchWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
