"use client";

import { useState } from "react";
import { Github, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestApi } from "@/lib/api/client";

export function GithubConnectButton({ returnTo }: { returnTo: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConnect() {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const response = await requestApi<{ url: string }>("/github/connect", {
        queryParams: {
          returnTo,
        },
      });

      window.location.href = response.url;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start GitHub authorization.",
      );
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {errorMessage ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={handleConnect}
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Github className="mr-2 size-4" />
        )}
        Connect GitHub
      </Button>
    </div>
  );
}
