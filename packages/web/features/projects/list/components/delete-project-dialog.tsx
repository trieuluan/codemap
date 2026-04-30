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
import { useToast } from "@/components/ui/use-toast";
import {
  deleteProject,
  ProjectsApiError,
  type Project,
} from "@/features/projects/api";

export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
  onDeleted,
}: {
  project: Pick<Project, "id" | "name"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (projectId: string) => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const projectId = project?.id ?? activeProjectId;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        onOpenChange(nextOpen);
        if (nextOpen && project?.id) {
          setActiveProjectId(project.id);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete project</AlertDialogTitle>
          <AlertDialogDescription>
            {project
              ? `This will permanently delete ${project.name} and its import history.`
              : "This action will permanently delete the selected project."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={isPending || !projectId}
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();

              if (!projectId) {
                return;
              }

              startTransition(async () => {
                try {
                  await deleteProject(projectId);
                  onDeleted(projectId);
                  onOpenChange(false);
                  toast({
                    title: "Project deleted",
                    description: "The project was removed successfully.",
                  });
                } catch (error) {
                  toast({
                    title: "Unable to delete project",
                    description:
                      error instanceof ProjectsApiError
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
