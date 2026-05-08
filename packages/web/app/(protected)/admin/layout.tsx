import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requestApi } from "@/lib/api/client";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";

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
    <div className="min-h-screen aurora-bg">
      <AppSidebar />
      <div className="lg:pl-64">
        <AppTopbar />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
