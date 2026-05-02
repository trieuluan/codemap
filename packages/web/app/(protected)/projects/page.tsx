import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerWorkspacesApi } from "@/features/workspaces/api";

export default async function ProjectsRedirectPage() {
  const cookieHeader = (await cookies()).toString();
  const api = createServerWorkspacesApi({ cookieHeader });
  const workspaces = await api.listWorkspaces().catch(() => []);
  const workspaceId = workspaces[0]?.workspace.id;
  if (!workspaceId) redirect("/account/settings");
  redirect(`/w/${workspaceId}/projects`);
}
