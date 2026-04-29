import { Suspense } from "react";
import { cookies } from "next/headers";
import { WelcomeSection } from "@/features/dashboard/welcome-section";
import { StatsSummary } from "@/features/dashboard/stats-summary";
import { OnboardingCards } from "@/features/dashboard/onboarding-cards";
import { QuickActions } from "@/features/dashboard/quick-actions";
import { RecentActivity } from "@/features/dashboard/recent-activity";
import { GithubConnectCard } from "@/features/github/components/github-connect-card";
import { GithubOAuthToast } from "@/features/github/components/github-oauth-toast";
import { GitlabConnectCard } from "@/features/gitlab/components/gitlab-connect-card";
import { GitlabOAuthToast } from "@/features/gitlab/components/gitlab-oauth-toast";
import { createServerProjectsApi } from "@/features/projects/api";

export default async function DashboardPage() {
  const cookieHeader = (await cookies()).toString();
  const api = createServerProjectsApi({ cookieHeader });

  let projects: Awaited<ReturnType<typeof api.getProjects>> = [];
  try {
    projects = await api.getProjects();
  } catch {
    // show dashboard with empty state on error
  }

  const projectCount = projects.length;
  const hasProjects = projectCount > 0;

  return (
    <div className="space-y-8">
      <Suspense>
        <GithubOAuthToast />
        <GitlabOAuthToast />
      </Suspense>

      <WelcomeSection />

      <StatsSummary projectCount={projectCount} />

      <OnboardingCards hasProjects={hasProjects} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>
        <div className="space-y-4">
          <GithubConnectCard />
          <GitlabConnectCard />
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
