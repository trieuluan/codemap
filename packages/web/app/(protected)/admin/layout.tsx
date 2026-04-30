import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requestApi } from "@/lib/api/client";
import { DashboardHeader } from "@/features/dashboard/header";
import { DashboardSidebar } from "@/features/dashboard/sidebar";

interface MeResponse {
  roles: string[];
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieHeader = (await cookies()).toString();

  try {
    const me = await requestApi<MeResponse>("/auth/me", { cookieHeader });
    if (!me.roles.includes("admin")) {
      redirect("/dashboard");
    }
  } catch {
    redirect("/dashboard");
  }

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
