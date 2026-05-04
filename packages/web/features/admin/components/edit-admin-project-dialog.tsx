"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateAdminProject,
  type AdminProject,
} from "@/features/admin/api";

type FieldErrors = Partial<
  Record<"name" | "description" | "repositoryUrl" | "defaultBranch" | "form", string>
>;

export function EditAdminProjectDialog({
  project,
  workspaces,
  open,
  onOpenChange,
  onUpdated,
}: {
  project: AdminProject | null;
  workspaces: Array<{ id: string; name: string; slug: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (project: AdminProject) => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (open && project) {
      setName(project.name);
      setDescription(project.description ?? "");
      setDefaultBranch(project.defaultBranch ?? "");
      setRepositoryUrl(project.repositoryUrl ?? "");
      setVisibility(project.visibility);
      setErrors({});
    }
  }, [open, project]);

  function firstError(errs: string[] | undefined) {
    return errs?.[0];
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;

    setErrors({});

    startTransition(async () => {
      try {
        const updated = await updateAdminProject(project.id, {
          name,
          description: description.trim() ? description : null,
          defaultBranch: defaultBranch.trim() ? defaultBranch : null,
          repositoryUrl: repositoryUrl.trim() ? repositoryUrl : null,
          visibility,
        });

        toast({
          title: "Project updated",
          description: `${updated.name} has been updated.`,
        });

        onUpdated(updated);
        onOpenChange(false);
      } catch (error) {
        toast({
          title: "Unable to update project",
          description:
            error instanceof Error ? error.message : "An unexpected error occurred.",
          variant: "destructive",
        });
      }
    });
  }

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            Update project metadata. Changes apply immediately.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="edit-admin-project-name">Name</Label>
            <Input
              id="edit-admin-project-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((c) => ({ ...c, name: undefined }));
              }}
              disabled={isPending}
              required
            />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-admin-project-workspace">Workspace</Label>
            <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm">
              {workspaces.find((w) => w.id === project.workspaceId)?.name ?? project.workspaceId}
            </div>
            <p className="text-xs text-muted-foreground">
              Workspace cannot be changed after creation.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-admin-project-description">Description</Label>
            <Textarea
              id="edit-admin-project-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setErrors((c) => ({ ...c, description: undefined }));
              }}
              disabled={isPending}
            />
            {errors.description ? (
              <p className="text-sm text-destructive">{errors.description}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-admin-project-repo">Repository URL</Label>
              <Input
                id="edit-admin-project-repo"
                type="url"
                value={repositoryUrl}
                onChange={(e) => {
                  setRepositoryUrl(e.target.value);
                  setErrors((c) => ({ ...c, repositoryUrl: undefined }));
                }}
                placeholder="https://github.com/org/repo"
                disabled={isPending}
              />
              {errors.repositoryUrl ? (
                <p className="text-sm text-destructive">{errors.repositoryUrl}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-admin-project-branch">Default branch</Label>
              <Input
                id="edit-admin-project-branch"
                value={defaultBranch}
                onChange={(e) => {
                  setDefaultBranch(e.target.value);
                  setErrors((c) => ({ ...c, defaultBranch: undefined }));
                }}
                placeholder="main"
                disabled={isPending}
              />
              {errors.defaultBranch ? (
                <p className="text-sm text-destructive">{errors.defaultBranch}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-admin-project-visibility">Visibility</Label>
            <Select
              value={visibility}
              onValueChange={setVisibility}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {errors.form ? (
            <p className="text-sm text-destructive">{errors.form}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
