"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

/**
 * Reads github_connected / github_error query params after OAuth callback
 * and shows a toast. Cleans up the URL afterwards.
 */
export function GithubOAuthToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;

    const connected = searchParams.get("github_connected");
    const login = searchParams.get("login");
    const error = searchParams.get("github_error");

    if (!connected && !error) return;
    handled.current = true;

    if (connected === "1") {
      toast({
        title: "GitHub connected",
        description: login ? `Connected as @${login}` : "Your GitHub account is now linked.",
      });
    } else if (error) {
      const messages: Record<string, string> = {
        expired_state: "The authorization link expired. Please try again.",
        token_exchange_failed: "GitHub authorization failed. Please try again.",
        invalid_request: "Invalid request. Please try again.",
      };

      toast({
        title: "GitHub connection failed",
        description: messages[error] ?? "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }

    // Clean up query params from URL
    const params = new URLSearchParams(searchParams.toString());
    params.delete("github_connected");
    params.delete("github_error");
    params.delete("login");
    const newUrl = params.size > 0 ? `${pathname}?${params}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [searchParams, router, pathname, toast]);

  return null;
}
