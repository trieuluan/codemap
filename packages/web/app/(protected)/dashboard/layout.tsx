import { Metadata } from "next";
import { AuthGuard } from "@/features/auth/auth-guard";
import { DashboardSidebar } from "@/features/dashboard/sidebar";
import { DashboardHeader } from "@/features/dashboard/header";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "CodeMap dashboard - manage your projects and API",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <DashboardSidebar />
        <div className="lg:pl-64">
          <DashboardHeader />
          <main className="p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
