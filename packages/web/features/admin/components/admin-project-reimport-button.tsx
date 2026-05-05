"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ApiClientError } from "@/lib/api/client";
import { triggerAdminProjectImport } from "@/features/admin/api";

export function AdminProjectReimportButton({
  projectId,
  defaultBranch,
  disabled,
}: {
  projectId: string;
  defaultBranch?: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || isPending}
      onClick={() => {
        startTransition(async () => {
          try {
            await triggerAdminProjectImport(projectId, {
              branch: defaultBranch ?? undefined,
            });
            router.refresh();
            toast({ title: "Re-import started" });
          } catch (error) {
            toast({
              title: "Unable to start re-import",
              description:
                error instanceof ApiClientError
                  ? error.message
                  : "An unexpected error occurred.",
              variant: "destructive",
            });
          }
        });
      }}
    >
      <RefreshCw className="mr-2 size-4" />
      {isPending ? "Starting..." : "Re-import"}
    </Button>
  );
}
