"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requestApi } from "@/lib/api/client";

export function AuthorizeButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleApprove() {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await requestApi("/mcp/auth/approve", {
        method: "POST",
        body: {
          sessionId,
        },
      });
      setIsApproved(true);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to approve MCP login.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isApproved) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200">
          Authorization complete. You can return to your AI tool now.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {errorMessage ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      <Button onClick={handleApprove} disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Authorizing...
          </>
        ) : (
          "Authorize CodeMap MCP"
        )}
      </Button>
    </div>
  );
}
