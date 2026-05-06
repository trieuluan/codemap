"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { createProjectFromGitlab, ProjectsApiError } from "@/features/projects/api";
import { GitlabIcon } from "@/components/brand-icons";

export function ImportFromGitlabDialog({
  trigger,
  workspaceId,
  isConnected = true,
}: {
  trigger: React.ReactNode;
  workspaceId: string;
  isConnected?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [name, setName] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleClose() {
    setOpen(false);
    setRepositoryUrl("");
    setName("");
    setDefaultBranch("");
  }

  function handleImport() {
    if (!repositoryUrl.trim()) return;
    startTransition(async () => {
      try {
        const result = await createProjectFromGitlab({
          repositoryUrl: repositoryUrl.trim(),
          workspaceId,
          name: name.trim() || undefined,
          defaultBranch: defaultBranch.trim() || undefined,
        });

        toast({
          title: "Import started",
          description: `${result.project.name} is being indexed.`,
        });

        handleClose();
        router.push(`/w/${workspaceId}/projects/${result.project.id}`);
        router.refresh();
      } catch (error) {
        toast({
          title: "Import failed",
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
      onOpenChange={(next: boolean) => {
        if (!next) handleClose();
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitlabIcon className="size-4" />
            Import from GitLab
          </DialogTitle>
          <DialogDescription>
            Enter your GitLab repository URL to import and index.
          </DialogDescription>
        </DialogHeader>

        {!isConnected ? (
          <div className="rounded-md border border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            Connect your GitLab account in{" "}
            <strong className="text-foreground">Account → Integrations</strong>{" "}
            to import private repositories.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gitlab-repo-url">Repository URL</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="gitlab-repo-url"
                  className="pl-9"
                  placeholder="https://gitlab.com/group/repo"
                  value={repositoryUrl}
                  onChange={(e) => setRepositoryUrl(e.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gitlab-project-name">Name (optional)</Label>
                <Input
                  id="gitlab-project-name"
                  placeholder="My Project"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gitlab-branch">Default branch (optional)</Label>
                <Input
                  id="gitlab-branch"
                  placeholder="main"
                  value={defaultBranch}
                  onChange={(e) => setDefaultBranch(e.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!isConnected || !repositoryUrl.trim() || isPending}
          >
            {isPending ? "Importing..." : "Import"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
