import { WelcomeSection } from "@/features/dashboard/welcome-section";
import { StatsSummary } from "@/features/dashboard/stats-summary";
import { OnboardingCards } from "@/features/dashboard/onboarding-cards";
import { QuickActions } from "@/features/dashboard/quick-actions";
import { RecentActivity } from "@/features/dashboard/recent-activity";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <WelcomeSection userName="John" />

      <StatsSummary />

      <OnboardingCards />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>
        <div>
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
