"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Github, Search, Lock, Globe } from "lucide-react";
import useSWR from "swr";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  browserProjectsApi,
  createProjectFromGithub,
  ProjectsApiError,
} from "@/features/projects/api";
import type { GithubRepositoryOption } from "@/features/projects/api";

export function ImportFromGithubDialog({
  trigger,
  workspaceId,
}: {
  trigger: React.ReactNode;
  workspaceId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GithubRepositoryOption | null>(null);
  const [isPending, startTransition] = useTransition();

  const { data: repos, isLoading } = useSWR(
    open ? ["github-repos", query] : null,
    ([, q]) => browserProjectsApi.listGithubRepositories(q || undefined, 30),
  );

  function handleClose() {
    setOpen(false);
    setQuery("");
    setSelected(null);
  }

  function handleImport() {
    if (!selected) return;
    startTransition(async () => {
      try {
        const result = await createProjectFromGithub({
          repositoryUrl: selected.repositoryUrl,
          workspaceId,
          name: selected.name,
          defaultBranch: selected.defaultBranch ?? undefined,
          externalRepoId: selected.id,
          isPrivate: selected.private,
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
            <Github className="size-4" />
            Import from GitHub
          </DialogTitle>
          <DialogDescription>
            Select a repository to import and index.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search repositories..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border border-border/70 divide-y divide-border/50">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                Loading repositories...
              </div>
            ) : !repos || repos.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                {query ? "No repositories found." : "No repositories available."}
              </div>
            ) : (
              repos.map((repo) => (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => setSelected(repo)}
                  disabled={isPending}
                  className={cn(
                    "w-full flex items-start gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50",
                    selected?.id === repo.id && "bg-primary/8 hover:bg-primary/10",
                  )}
                >
                  <div className="mt-0.5 shrink-0 text-muted-foreground">
                    {repo.private ? (
                      <Lock className="size-3.5" />
                    ) : (
                      <Globe className="size-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{repo.fullName}</span>
                      {repo.private && (
                        <Badge variant="outline" className="text-xs shrink-0 h-4 px-1">
                          Private
                        </Badge>
                      )}
                    </div>
                    {repo.defaultBranch && (
                      <span className="text-xs text-muted-foreground">
                        {repo.defaultBranch}
                      </span>
                    )}
                  </div>
                  {selected?.id === repo.id && (
                    <div className="mt-0.5 size-2 rounded-full bg-primary shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {selected && (
            <p className="text-xs text-muted-foreground">
              Selected: <span className="font-medium text-foreground">{selected.fullName}</span>
              {selected.private && " · Private repo — requires private repo access entitlement"}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!selected || isPending}>
            {isPending ? "Importing..." : "Import"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
