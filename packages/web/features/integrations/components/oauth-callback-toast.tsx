"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

type OAuthCallbackToastProps = {
  connectedParam: string;
  errorParam: string;
  providerName: string;
  defaultDescription: string;
  errorMessages: Record<string, string>;
};

export function OAuthCallbackToast({
  connectedParam,
  errorParam,
  providerName,
  defaultDescription,
  errorMessages,
}: OAuthCallbackToastProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;

    const connected = searchParams.get(connectedParam);
    const login = searchParams.get("login");
    const error = searchParams.get(errorParam);

    if (!connected && !error) return;
    handled.current = true;

    if (connected === "1") {
      toast({
        title: `${providerName} connected`,
        description: login ? `Connected as @${login}` : defaultDescription,
      });
    } else if (error) {
      toast({
        title: `${providerName} connection failed`,
        description: errorMessages[error] ?? "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete(connectedParam);
    params.delete(errorParam);
    params.delete("login");
    const newUrl = params.size > 0 ? `${pathname}?${params}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [
    connectedParam,
    defaultDescription,
    errorMessages,
    errorParam,
    pathname,
    providerName,
    router,
    searchParams,
    toast,
  ]);

  return null;
}
