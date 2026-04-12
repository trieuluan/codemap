import { AlertCircle, CheckCircle2, Clock3, LoaderCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ProjectImport } from "@/lib/api/projects";
import { formatProjectDate } from "../shared/project-helpers";

function ImportStatusIcon({ status }: { status: ProjectImport["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-4 text-emerald-500" />;
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

export function ProjectImportHistory({ imports }: { imports: ProjectImport[] }) {
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
            {imports.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border/70 bg-background/70 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ImportStatusIcon status={item.status} />
                      <p className="text-sm font-medium capitalize">{item.status}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Started {formatProjectDate(item.startedAt)}
                      {item.branch ? ` • ${item.branch}` : ""}
                    </p>
                    {item.completedAt ? (
                      <p className="text-xs text-muted-foreground">
                        Completed {formatProjectDate(item.completedAt)}
                      </p>
                    ) : null}
                    {item.errorMessage ? (
                      <p className="text-sm text-destructive">{item.errorMessage}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
