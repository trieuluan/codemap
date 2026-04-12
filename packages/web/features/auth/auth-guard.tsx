"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending, error } = authClient.useSession();

  useEffect(() => {
    if (isPending) {
      return;
    }

    if (session?.session && session?.user) {
      return;
    }

    const redirectTo = pathname || "/dashboard";
    router.replace(`/auth?redirect=${encodeURIComponent(redirectTo)}`);
  }, [isPending, pathname, router, session]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !session?.session || !session?.user) {
    return null;
  }

  return <>{children}</>;
}
