import { cookies } from "next/headers";
import { ProjectList } from "@/features/projects/list/project-list";
import { createServerProjectsApi } from "@/features/projects/api";
import { createServerWorkspacesApi } from "@/features/workspaces/api";

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const cookieHeader = (await cookies()).toString();
  const projectsApi = createServerProjectsApi({ cookieHeader });
  const workspacesApi = createServerWorkspacesApi({ cookieHeader });

  const [projects, workspaceRows] = await Promise.all([
    projectsApi.getProjects({ include: ["latestImport"], workspaceId }),
    workspacesApi.listWorkspaces(),
  ]);

  const workspaceMap = Object.fromEntries(
    workspaceRows.map(({ workspace }) => [workspace.id, workspace.name]),
  );
  const showWorkspace = workspaceRows.length > 1;

  return (
    <ProjectList
      initialProjects={projects}
      workspaceMap={workspaceMap}
      showWorkspace={showWorkspace}
      workspaceId={workspaceId}
    />
  );
}
