import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, BarChart2, Cloud, Network, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createServerWorkspacesApi } from "@/features/workspaces/api";

export default async function WorkspaceUpgradePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const api = createServerWorkspacesApi({
    cookieHeader: (await cookies()).toString(),
  });
  const workspaceDetail = await api.getWorkspace(workspaceId);
  const isCloudEnabled = workspaceDetail.entitlements.cloudImportAccess;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/w/${workspaceId}/projects`}>
            <ArrowLeft className="size-4" />
            Back to projects
          </Link>
        </Button>
        <div className="space-y-3">
          <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-background">
            <Cloud className="size-6 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              Upgrade for cloud indexing
            </h1>
            <p className="max-w-2xl text-muted-foreground">
              Basic workspaces keep MCP local-index tools available. Developer
              and Team plans add cloud imports, dependency graph exploration,
              and project insights in the web app.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Cloud imports",
            description: "Run full repository imports and re-import after code changes.",
            icon: RefreshCcw,
          },
          {
            title: "Dependency graph",
            description: "Explore folder, file, and symbol relationships in the browser.",
            icon: Network,
          },
          {
            title: "Project insights",
            description: "Review structure and dependency findings from cloud indexing.",
            icon: BarChart2,
          },
        ].map((item) => (
          <div key={item.title} className="rounded-lg border border-border p-5">
            <item.icon className="mb-4 size-5 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-5">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {isCloudEnabled
              ? "Cloud indexing is already enabled for this workspace."
              : "Choose Developer or Team to enable cloud indexing."}
          </p>
          <p className="text-sm text-muted-foreground">
            Current plan: {workspaceDetail.workspace.plan}
          </p>
        </div>
        <Button asChild>
          <Link href={`/w/${workspaceId}/settings/billing`}>View billing</Link>
        </Button>
      </div>
    </div>
  );
}
