"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

export function GitlabOAuthToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;

    const connected = searchParams.get("gitlab_connected");
    const login = searchParams.get("login");
    const error = searchParams.get("gitlab_error");

    if (!connected && !error) return;
    handled.current = true;

    if (connected === "1") {
      toast({
        title: "GitLab connected",
        description: login ? `Connected as @${login}` : "Your GitLab account is now linked.",
      });
    } else if (error) {
      const messages: Record<string, string> = {
        expired_state: "The authorization link expired. Please try again.",
        token_exchange_failed: "GitLab authorization failed. Please try again.",
        invalid_request: "Invalid request. Please try again.",
      };

      toast({
        title: "GitLab connection failed",
        description: messages[error] ?? "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("gitlab_connected");
    params.delete("gitlab_error");
    params.delete("login");
    const newUrl = params.size > 0 ? `${pathname}?${params}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [searchParams, router, pathname, toast]);

  return null;
}
