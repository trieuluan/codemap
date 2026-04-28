import { Suspense } from "react";
import { WelcomeSection } from "@/features/dashboard/welcome-section";
import { StatsSummary } from "@/features/dashboard/stats-summary";
import { OnboardingCards } from "@/features/dashboard/onboarding-cards";
import { QuickActions } from "@/features/dashboard/quick-actions";
import { RecentActivity } from "@/features/dashboard/recent-activity";
import { GithubConnectCard } from "@/features/github/components/github-connect-card";
import { GithubOAuthToast } from "@/features/github/components/github-oauth-toast";
import { GitlabConnectCard } from "@/features/gitlab/components/gitlab-connect-card";
import { GitlabOAuthToast } from "@/features/gitlab/components/gitlab-oauth-toast";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <Suspense>
        <GithubOAuthToast />
        <GitlabOAuthToast />
      </Suspense>

      <WelcomeSection userName="John" />

      <StatsSummary />

      <OnboardingCards />

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
