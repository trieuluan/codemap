import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

const getSession = cache(async () => {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  if (!cookieHeader) return null;

  try {
    const res = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    return res.json();
  } catch {
    return null;
  }
});

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();

  if (user) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
