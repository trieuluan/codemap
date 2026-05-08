import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { createServerWorkspacesApi } from "@/features/workspaces/api";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const cookieHeader = (await cookies()).toString();
  const api = createServerWorkspacesApi({ cookieHeader });

  const workspaces = await api.listWorkspaces().catch(() => []);
  const valid = workspaces.some((w) => w.workspace.id === workspaceId);
  if (!valid) notFound();

  return (
    <div className="min-h-screen aurora-bg">
      <AppSidebar workspaceId={workspaceId} />
      <div className="lg:pl-64">
        <AppTopbar />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
