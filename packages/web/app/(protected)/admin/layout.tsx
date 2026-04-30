import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requestApi } from "@/lib/api/client";

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

  return <>{children}</>;
}
