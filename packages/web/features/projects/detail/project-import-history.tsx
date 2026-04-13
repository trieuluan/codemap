"use client";

import { useTransition } from "react";
import { AlertCircle, Clock3, LoaderCircle, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  ProjectsApiError,
  retryProjectImport,
  type ProjectImport,
} from "@/lib/api/projects";
import { useToast } from "@/components/ui/use-toast";
import { LocalProjectDate } from "../shared/local-project-date";
import { ProjectImportStatusBadge } from "../shared/project-import-status-badge";

function ImportStatusIcon({ status }: { status: ProjectImport["status"] }) {
  switch (status) {
    case "failed":
      return <AlertCircle className="size-4 text-destructive" />;
    case "running":
      return <LoaderCircle className="size-4 animate-spin text-blue-500" />;
    case "pending":
      return <Clock3 className="size-4 text-muted-foreground" />;
    default:
      return <Clock3 className="size-4 text-muted-foreground" />;
  }
}

function canRetryImport(status: ProjectImport["status"]) {
  return status === "failed" || status === "pending" || status === "running";
}

function getRetryLabel(status: ProjectImport["status"]) {
  return status === "failed" ? "Retry" : "Restart";
}

export function ProjectImportHistory({
  projectId,
  imports,
  onImportChanged,
}: {
  projectId: string;
  imports: ProjectImport[];
  onImportChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [isRetryPending, startRetryTransition] = useTransition();

  function handleRetry(projectImport: ProjectImport) {
    startRetryTransition(async () => {
      try {
        await retryProjectImport(projectId, projectImport.id);
        await onImportChanged();

        toast({
          title: "Import restarted",
          description:
            projectImport.status === "failed"
              ? "A new import attempt was created from this failed run."
              : "The interrupted import was restarted as a new attempt.",
        });
      } catch (error) {
        toast({
          title: "Unable to restart import",
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
    <Card>
      <CardHeader>
        <CardTitle>Import history</CardTitle>
      </CardHeader>
      <CardContent>
        {imports.length === 0 ? (
          <Empty className="border border-dashed border-border bg-background p-8">
            <EmptyHeader>
              <EmptyTitle>No imports yet</EmptyTitle>
              <EmptyDescription>
                Trigger the first import to start tracking repository indexing
                history for this project.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-3">
            {imports.map((item, index) => (
              <div
                key={item.id}
                className="rounded-lg border border-border/70 bg-background/70 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ImportStatusIcon status={item.status} />
                      <ProjectImportStatusBadge status={item.status} />
                      {index === 0 ? <Badge variant="secondary">Latest</Badge> : null}
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>
                        Branch:{" "}
                        <span className="font-medium text-foreground">
                          {item.branch || "Default branch"}
                        </span>
                      </p>
                      <p>
                        Started <LocalProjectDate value={item.startedAt} />
                      </p>
                    </div>
                    {item.completedAt ? (
                      <p className="text-xs text-muted-foreground">
                        Completed <LocalProjectDate value={item.completedAt} />
                      </p>
                    ) : null}
                    {item.errorMessage ? (
                      <p className="text-sm text-destructive">{item.errorMessage}</p>
                    ) : null}
                  </div>
                  {canRetryImport(item.status) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRetry(item)}
                      disabled={isRetryPending}
                    >
                      <RotateCcw className="size-4" />
                      {getRetryLabel(item.status)}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
