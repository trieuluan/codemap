import { GitCommit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LocalProjectDate } from "@/features/projects/components/local-project-date";
import { MetricsDeltaGrid } from "./metrics-delta-grid";
import type { ProjectImport } from "@/features/projects/api";
import type { MetricDelta } from "../types";

function shortSha(sha: string | null) {
  return sha ? sha.slice(0, 7) : "—";
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border glass-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export function SingleImportDetail({
  imp,
  previous,
}: {
  imp: ProjectImport;
  previous: ProjectImport | null;
}) {
  const metrics: MetricDelta[] | null = previous
    ? [
        {
          label: "Files",
          base: previous.indexedFileCount,
          head: imp.indexedFileCount,
          delta: imp.indexedFileCount - previous.indexedFileCount,
        },
        {
          label: "Symbols",
          base: previous.indexedSymbolCount,
          head: imp.indexedSymbolCount,
          delta: imp.indexedSymbolCount - previous.indexedSymbolCount,
        },
        {
          label: "Dependencies",
          base: previous.indexedEdgeCount,
          head: imp.indexedEdgeCount,
          delta: imp.indexedEdgeCount - previous.indexedEdgeCount,
        },
      ]
    : null;

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <GitCommit className="size-4 text-muted-foreground" />
          <span className="font-mono text-sm">{shortSha(imp.commitSha)}</span>
          {imp.branch ? (
            <Badge variant="secondary" className="font-mono">
              {imp.branch}
            </Badge>
          ) : null}
        </div>
        <CardTitle className="text-xl">Import details</CardTitle>
        {imp.commitMessage ? (
          <p className="text-base font-medium text-foreground">
            {imp.commitMessage}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {imp.completedAt ? "Completed" : "Started"}{" "}
          <LocalProjectDate
            value={imp.completedAt ?? imp.startedAt}
            className="text-foreground"
          />
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Files" value={imp.indexedFileCount} />
          <Stat label="Symbols" value={imp.indexedSymbolCount} />
          <Stat label="Dependencies" value={imp.indexedEdgeCount} />
        </div>

        {metrics ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Change vs previous import</h3>
            <MetricsDeltaGrid metrics={metrics} />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
            This is the first import — no previous snapshot to compare against.
            Use the <span className="font-medium text-foreground">Compare</span>{" "}
            button on a later import to see deltas.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
