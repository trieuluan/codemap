"use client";

import { AlertCircle, Clock3, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { type ProjectImport } from "@/features/projects/api";
import { LocalProjectDate } from "../../components/local-project-date";
import { ProjectImportStatusBadge } from "../../components/project-import-status-badge";

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

export function ProjectImportHistory({
  imports,
}: {
  imports: ProjectImport[];
}) {
  const current = imports[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current import</CardTitle>
      </CardHeader>
      <CardContent>
        {!current ? (
          <Empty className="border border-dashed border-border bg-background p-8">
            <EmptyHeader>
              <EmptyTitle>No imports yet</EmptyTitle>
              <EmptyDescription>
                Trigger the first import to start indexing this repository.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div
            className="rounded-lg border border-border/70 bg-background/70 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ImportStatusIcon status={current.status} />
                  <ProjectImportStatusBadge status={current.status} />
                  {current.sourceAvailable ? (
                    <Badge variant="secondary">Preview ready</Badge>
                  ) : null}
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    Branch:{" "}
                    <span className="font-medium text-foreground">
                      {current.branch || "Default branch"}
                    </span>
                  </p>
                  <p>
                    Started <LocalProjectDate value={current.startedAt} />
                  </p>
                </div>
                {current.completedAt ? (
                  <p className="text-xs text-muted-foreground">
                    Completed <LocalProjectDate value={current.completedAt} />
                  </p>
                ) : null}
                {current.errorMessage ? (
                  <p className="text-sm text-destructive">{current.errorMessage}</p>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
