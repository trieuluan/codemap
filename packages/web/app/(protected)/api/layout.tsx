import { DashboardSidebar } from "@/features/dashboard/sidebar";
import { DashboardHeader } from "@/features/dashboard/header";

export default function ApiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <DashboardSidebar />
      <div className="lg:pl-64">
        <DashboardHeader />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
