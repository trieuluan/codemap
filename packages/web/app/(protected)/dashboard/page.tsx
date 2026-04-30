import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowRight, CreditCard, GitBranch, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WelcomeSection } from "@/features/dashboard/welcome-section";
import { StatsSummary } from "@/features/dashboard/stats-summary";
import { OnboardingCards } from "@/features/dashboard/onboarding-cards";
import { RecentActivity } from "@/features/dashboard/recent-activity";
import { GithubConnectCard } from "@/features/github/components/github-connect-card";
import { GithubOAuthToast } from "@/features/github/components/github-oauth-toast";
import { GitlabConnectCard } from "@/features/gitlab/components/gitlab-connect-card";
import { GitlabOAuthToast } from "@/features/gitlab/components/gitlab-oauth-toast";
import { createServerProjectsApi } from "@/features/projects/api";
import { createServerSettingsApi } from "@/features/settings/api";

function FirstProjectCallout() {
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
          <Link href="/projects">
            Create project
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function BillingV2Card() {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-secondary">
            <CreditCard className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Billing in V2</p>
            <p className="text-xs text-muted-foreground">No billing setup needed today.</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Team seats, usage limits, and billing controls are planned for V2.
          Current onboarding focuses on projects, MCP, and repository access.
        </p>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const cookieHeader = (await cookies()).toString();
  const api = createServerProjectsApi({ cookieHeader });
  const settingsApi = createServerSettingsApi({ cookieHeader });

  let projects: Awaited<ReturnType<typeof api.getProjects>> = [];
  let apiKeys: Awaited<ReturnType<typeof settingsApi.listApiKeys>> = [];
  try {
    projects = await api.getProjects();
  } catch {
    // show dashboard with empty state on error
  }
  try {
    apiKeys = await settingsApi.listApiKeys();
  } catch {
    // keep MCP onboarding pending if keys cannot be loaded
  }

  const projectCount = projects.length;
  const hasProjects = projectCount > 0;
  const firstProjectId = projects[0]?.id;
  const hasMcpConnection = apiKeys.some((key) => {
    if (!key.enabled) return false;
    if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) {
      return false;
    }
    return key.metadata?.client === "mcp";
  });

  return (
    <div className="space-y-8">
      <Suspense>
        <GithubOAuthToast />
        <GitlabOAuthToast />
      </Suspense>

      <WelcomeSection />

      {!hasProjects ? <FirstProjectCallout /> : null}

      <StatsSummary projectCount={projectCount} />

      <OnboardingCards
        hasProjects={hasProjects}
        hasMcpConnection={hasMcpConnection}
        firstProjectId={firstProjectId}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>
        <div id="repository-providers" className="space-y-4 scroll-mt-20">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-muted-foreground" />
            Optional setup
          </div>
          <GithubConnectCard />
          <GitlabConnectCard />
          <BillingV2Card />
        </div>
      </div>
    </div>
  );
}
