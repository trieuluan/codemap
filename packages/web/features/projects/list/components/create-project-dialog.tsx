"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { createProject, ProjectsApiError } from "@/features/projects/api";
import { useToast } from "@/components/ui/use-toast";
import { createProjectInputSchema } from "@codemap/shared";

type FieldErrors = Partial<
  Record<"name" | "description" | "repositoryUrl" | "defaultBranch", string>
>;

export function CreateProjectDialog({
  trigger,
}: {
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  function resetForm() {
    setName("");
    setDescription("");
    setRepositoryUrl("");
    setDefaultBranch("");
    setErrors({});
  }

  function firstError(errors: string[] | undefined) {
    return errors?.[0];
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = createProjectInputSchema.safeParse({
      name,
      description: description.trim() ? description : null,
      repositoryUrl: repositoryUrl.trim() ? repositoryUrl : null,
      defaultBranch: defaultBranch.trim() ? defaultBranch : null,
    });

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        name: firstError(fieldErrors.name),
        description: firstError(fieldErrors.description),
        repositoryUrl: firstError(fieldErrors.repositoryUrl),
        defaultBranch: firstError(fieldErrors.defaultBranch),
      });
      return;
    }

    setErrors({});

    startTransition(async () => {
      try {
        const project = await createProject(parsed.data);

        toast({
          title: "Project created",
          description: `${project.name} is ready for setup.`,
        });

        setOpen(false);
        resetForm();
        router.push(`/projects/${project.id}`);
        router.refresh();
      } catch (error) {
        toast({
          title: "Unable to create project",
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen && !isPending) {
          resetForm();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Add the repository URL up front so the first import can be triggered
            as soon as the project is created.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setErrors((current) => ({ ...current, name: undefined }));
              }}
              placeholder="CodeMap Web"
              disabled={isPending}
              required
            />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setErrors((current) => ({
                  ...current,
                  description: undefined,
                }));
              }}
              placeholder="Short summary of the codebase or repository."
              disabled={isPending}
            />
            {errors.description ? (
              <p className="text-sm text-destructive">{errors.description}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-repository-url">Repository URL</Label>
              <Input
                id="project-repository-url"
                type="url"
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

            <div className="space-y-2">
              <Label htmlFor="project-default-branch">Default branch</Label>
              <Input
                id="project-default-branch"
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
          </div>

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
              {isPending ? "Creating..." : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
