import { DashboardSidebar } from "@/features/dashboard/sidebar";
import { DashboardHeader } from "@/features/dashboard/header";
import { AccountSettingsNav } from "@/features/settings/account-settings-nav";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <DashboardSidebar />
      <div className="lg:pl-64">
        <DashboardHeader />
        <main className="p-4 lg:p-6">
          <div className="space-y-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
              <p className="text-sm text-muted-foreground">
                Manage your personal account settings and API access.
              </p>
            </div>
            <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
              <AccountSettingsNav />
              <div className="min-w-0 space-y-4">{children}</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
