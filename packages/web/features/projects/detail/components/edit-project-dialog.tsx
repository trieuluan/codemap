"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  ProjectsApiError,
  type Project,
  updateProject,
} from "@/features/projects/api";
import { updateProjectInputSchema } from "@codemap/shared";

type FieldErrors = Partial<
  Record<
    "name" | "description" | "repositoryUrl" | "defaultBranch" | "form",
    string
  >
>;

export function EditProjectDialog({
  project,
  trigger,
  onUpdated,
}: {
  project: Project;
  trigger: React.ReactNode;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [defaultBranch, setDefaultBranch] = useState(project.defaultBranch ?? "");
  const [repositoryUrl, setRepositoryUrl] = useState(project.repositoryUrl ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (open) {
      setName(project.name);
      setDescription(project.description ?? "");
      setDefaultBranch(project.defaultBranch ?? "");
      setRepositoryUrl(project.repositoryUrl ?? "");
      setErrors({});
    }
  }, [open, project]);

  function firstError(errors: string[] | undefined) {
    return errors?.[0];
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = updateProjectInputSchema.safeParse({
      name,
      description: description.trim() ? description : null,
      defaultBranch: defaultBranch.trim() ? defaultBranch : null,
      repositoryUrl: repositoryUrl.trim() ? repositoryUrl : null,
    });

    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      setErrors({
        name: firstError(flattened.fieldErrors.name),
        description: firstError(flattened.fieldErrors.description),
        defaultBranch: firstError(flattened.fieldErrors.defaultBranch),
        repositoryUrl: firstError(flattened.fieldErrors.repositoryUrl),
        form: firstError(flattened.formErrors),
      });
      return;
    }

    setErrors({});

    startTransition(async () => {
      try {
        await updateProject(project.id, parsed.data);

        toast({
          title: "Project updated",
          description: `${project.name} has been updated.`,
        });
        setOpen(false);
        onUpdated();
      } catch (error) {
        toast({
          title: "Unable to update project",
          description:
            error instanceof ProjectsApiError
              ? error.message
              : "An unexpected error occurred. Please try again.",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            Update the project profile and repository metadata used by the import
            flow.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="edit-project-name">Name</Label>
            <Input
              id="edit-project-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setErrors((current) => ({ ...current, name: undefined }));
              }}
              required
              disabled={isPending}
            />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-project-description">Description</Label>
            <Textarea
              id="edit-project-description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setErrors((current) => ({
                  ...current,
                  description: undefined,
                }));
              }}
              disabled={isPending}
            />
            {errors.description ? (
              <p className="text-sm text-destructive">{errors.description}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-project-branch">Default branch</Label>
              <Input
                id="edit-project-branch"
                value={defaultBranch}
                onChange={(event) => {
                  setDefaultBranch(event.target.value);
                  setErrors((current) => ({
                    ...current,
                    defaultBranch: undefined,
                  }));
                }}
                placeholder="main"
                disabled={isPending}
              />
              {errors.defaultBranch ? (
                <p className="text-sm text-destructive">
                  {errors.defaultBranch}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-project-repository-url">Repository URL</Label>
              <Input
                id="edit-project-repository-url"
                value={repositoryUrl}
                onChange={(event) => {
                  setRepositoryUrl(event.target.value);
                  setErrors((current) => ({
                    ...current,
                    repositoryUrl: undefined,
                  }));
                }}
                placeholder="https://github.com/org/repo"
                disabled={isPending}
              />
              {errors.repositoryUrl ? (
                <p className="text-sm text-destructive">
                  {errors.repositoryUrl}
                </p>
              ) : null}
            </div>
          </div>
          {errors.form ? (
            <p className="text-sm text-destructive">{errors.form}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
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
