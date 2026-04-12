import { Metadata } from "next";
import { DashboardSidebar } from "@/features/dashboard/sidebar";
import { DashboardHeader } from "@/features/dashboard/header";

export const metadata: Metadata = {
  title: "Projects",
  description: "CodeMap projects - import and analyze your repositories",
};

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <DashboardSidebar />
      <div className="lg:pl-64">
        <DashboardHeader title="Projects" />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
