import { cookies } from "next/headers";
import { listAdminProjects, listAdminWorkspaces } from "@/features/admin/api";
import { AdminProjectsView } from "@/features/admin/components/admin-projects-view";

export default async function AdminProjectsPage() {
  const cookieHeader = (await cookies()).toString();

  const [projects, workspaces] = await Promise.all([
    listAdminProjects(undefined, cookieHeader),
    listAdminWorkspaces(cookieHeader),
  ]);

  return (
    <AdminProjectsView
      initialProjects={projects}
      initialWorkspaces={workspaces}
    />
  );
}
