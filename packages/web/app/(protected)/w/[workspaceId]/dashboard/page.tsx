import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowRight, CreditCard, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WelcomeSection } from "@/features/dashboard/welcome-section";
import { StatsSummary } from "@/features/dashboard/stats-summary";
import { OnboardingCards } from "@/features/dashboard/onboarding-cards";
import { RecentActivity } from "@/features/dashboard/recent-activity";
import {
  pickActiveProject,
  WorkspaceIndexCard,
} from "@/features/dashboard/workspace-index-card";
import { GithubOAuthToast } from "@/features/github/components/github-oauth-toast";
import { GitlabOAuthToast } from "@/features/gitlab/components/gitlab-oauth-toast";
import { createServerProjectsApi } from "@/features/projects/api";
import { createServerSettingsApi } from "@/features/settings/api";
import { createServerWorkspacesApi } from "@/features/workspaces/api";
import type { WorkspaceDetail } from "@/features/workspaces/api";

function FirstProjectCallout({ workspaceId }: { workspaceId: string }) {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <GitBranch className="size-5" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">Create or link your first project</p>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Start by importing a repository. CodeMap will index files,
              symbols, dependencies, history, and insights for the web app and MCP.
            </p>
          </div>
        </div>
        <Button asChild className="shrink-0">
          <Link href={`/w/${workspaceId}/projects`}>
            Create project
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function BillingV2Card({
  workspace,
  workspaceId,
}: {
  workspace: WorkspaceDetail | null;
  workspaceId: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-secondary">
            <CreditCard className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Workspace plan</p>
            <p className="text-xs text-muted-foreground">
              {workspace
                ? `${workspace.workspace.plan} plan · ${workspace.usage.projectCount} project(s)`
                : "Billing provider coming later"}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {workspace
            ? `Usage limits and billing controls are tracked for ${workspace.workspace.name}.`
            : "Team seats, usage limits, and billing controls are planned for V2."}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={`/w/${workspaceId}/settings/billing`}>View usage</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/w/${workspaceId}/upgrade`}>Upgrade</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const cookieHeader = (await cookies()).toString();
  const api = createServerProjectsApi({ cookieHeader });
  const settingsApi = createServerSettingsApi({ cookieHeader });
  const workspacesApi = createServerWorkspacesApi({ cookieHeader });

  let projects: Awaited<ReturnType<typeof api.getProjects>> = [];
  let apiKeys: Awaited<ReturnType<typeof settingsApi.listApiKeys>> = [];
  let workspaceDetail: WorkspaceDetail | null = null;

  try {
    projects = await api.getProjects({ workspaceId, include: ["latestImport"] });
  } catch { }
  try {
    apiKeys = await settingsApi.listApiKeys();
  } catch { }
  try {
    workspaceDetail = await workspacesApi.getWorkspace(workspaceId);
  } catch { }

  const projectCount = projects.length;
  const hasProjects = projectCount > 0;
  const firstProjectId = projects[0]?.id;
  const activeProject = pickActiveProject(projects);
  const hasMcpConnection = apiKeys.some((key) => {
    if (!key.enabled) return false;
    if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) return false;
    return key.metadata?.client === "mcp";
  });

  return (
    <div className="space-y-8">
      <Suspense>
        <GithubOAuthToast />
        <GitlabOAuthToast />
      </Suspense>

      <WelcomeSection
        workspaceId={workspaceId}
        workspaceName={workspaceDetail?.workspace.name}
      />

      {!hasProjects ? <FirstProjectCallout workspaceId={workspaceId} /> : null}

      <StatsSummary
        projectCount={projectCount}
        usage={workspaceDetail?.usage ?? null}
        hasMcpConnection={hasMcpConnection}
      />

      {hasProjects ? (
        <WorkspaceIndexCard project={activeProject} workspaceId={workspaceId} />
      ) : null}

      <OnboardingCards
        hasProjects={hasProjects}
        hasMcpConnection={hasMcpConnection}
        firstProjectId={firstProjectId}
        workspaceId={workspaceId}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivity workspaceId={workspaceId} />
        </div>
        <div className="space-y-4">
          <BillingV2Card workspace={workspaceDetail} workspaceId={workspaceId} />
        </div>
      </div>
    </div>
  );
}
