import { WorkspaceSettingsNav } from "@/features/settings/workspace-settings-nav";

export default async function WorkspaceSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage members and billing for this workspace.
        </p>
      </div>
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <WorkspaceSettingsNav workspaceId={workspaceId} />
        <div className="min-w-0 space-y-4">{children}</div>
      </div>
    </div>
  );
}
