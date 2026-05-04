"use client";

import { useState, useTransition } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAdminProject } from "@/features/admin/api";

type FieldErrors = Partial<
  Record<"name" | "description" | "repositoryUrl" | "defaultBranch" | "workspaceId" | "form", string>
>;

export function CreateAdminProjectDialog({
  trigger,
  workspaces,
  onCreated,
}: {
  trigger: React.ReactNode;
  workspaces: Array<{ id: string; name: string; slug: string }>;
  onCreated: (project: import("@/features/admin/api").AdminProject) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [provider, setProvider] = useState("github");
  const [errors, setErrors] = useState<FieldErrors>({});

  function resetForm() {
    setName("");
    setDescription("");
    setRepositoryUrl("");
    setDefaultBranch("");
    setWorkspaceId("");
    setProvider("github");
    setErrors({});
  }

  function firstError(errs: string[] | undefined) {
    return errs?.[0];
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspaceId) {
      setErrors({ workspaceId: "Please select a workspace." });
      return;
    }

    setErrors({});

    startTransition(async () => {
      try {
        const project = await createAdminProject({
          name,
          workspaceId,
          description: description.trim() ? description : null,
          repositoryUrl: repositoryUrl.trim() ? repositoryUrl : null,
          defaultBranch: defaultBranch.trim() ? defaultBranch : null,
          provider,
          visibility: "private",
        });

        toast({
          title: "Project created",
          description: `${project.name} has been created.`,
        });

        onCreated(project);
        setOpen(false);
        resetForm();
      } catch (error) {
        toast({
          title: "Unable to create project",
          description:
            error instanceof Error ? error.message : "An unexpected error occurred.",
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Create a new project from scratch. Provide a repository URL to enable imports.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="admin-project-name">Name</Label>
            <Input
              id="admin-project-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((c) => ({ ...c, name: undefined }));
              }}
              placeholder="My awesome project"
              disabled={isPending}
              required
            />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-project-workspace">Workspace</Label>
            <Select
              value={workspaceId}
              onValueChange={(v: string) => {
                setWorkspaceId(v);
                setErrors((c) => ({ ...c, workspaceId: undefined }));
              }}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.workspaceId ? (
              <p className="text-sm text-destructive">{errors.workspaceId}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-project-description">Description</Label>
            <Textarea
              id="admin-project-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setErrors((c) => ({ ...c, description: undefined }));
              }}
              placeholder="Short summary of the codebase."
              disabled={isPending}
            />
            {errors.description ? (
              <p className="text-sm text-destructive">{errors.description}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="admin-project-repo">Repository URL</Label>
              <Input
                id="admin-project-repo"
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
              <Label htmlFor="admin-project-branch">Default branch</Label>
              <Input
                id="admin-project-branch"
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
            <Label htmlFor="admin-project-provider">Provider</Label>
            <Select
              value={provider}
              onValueChange={setProvider}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="github">GitHub</SelectItem>
                <SelectItem value="gitlab">GitLab</SelectItem>
                <SelectItem value="local_workspace">Local Workspace</SelectItem>
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
