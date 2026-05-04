"use client";

import type { MouseEvent } from "react";
import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { deleteAdminProject, type AdminProject } from "@/features/admin/api";

export function DeleteAdminProjectDialog({
  project,
  open,
  onOpenChange,
  onDeleted,
}: {
  project: AdminProject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (projectId: string) => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const projectId = project?.id ?? activeProjectId;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        onOpenChange(nextOpen);
        if (nextOpen && project?.id) {
          setActiveProjectId(project.id);
          setReason("");
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete project</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            {project ? (
              <>
                <p>
                  This will permanently delete <strong>{project.name}</strong> and all
                  its import history, parsed data, and retained workspace source.
                  This action cannot be undone.
                </p>
                <div className="space-y-2 pt-2">
                  <Label htmlFor="delete-reason" className="text-xs font-medium">
                    Reason for deletion (optional, logged for audit)
                  </Label>
                  <Textarea
                    id="delete-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Orphaned project, cleanup after user left..."
                    className="text-sm"
                  />
                </div>
              </>
            ) : (
              <p>This action will permanently delete the selected project.</p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={isPending || !projectId}
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              if (!projectId) return;

              startTransition(async () => {
                try {
                  await deleteAdminProject(projectId);
                  onDeleted(projectId);
                  onOpenChange(false);
                  toast({
                    title: "Project deleted",
                    description: reason
                      ? `"${project?.name}" removed. Reason: ${reason}`
                      : `"${project?.name}" was removed successfully.`,
                  });
                } catch (error) {
                  toast({
                    title: "Unable to delete project",
                    description:
                      error instanceof Error
                        ? error.message
                        : "An unexpected error occurred. Please try again.",
                    variant: "destructive",
                  });
                }
              });
            }}
          >
            {isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
