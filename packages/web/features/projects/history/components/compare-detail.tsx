import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { LocalProjectDate } from "@/features/projects/components/local-project-date";
import { MetricsDeltaGrid } from "./metrics-delta-grid";
import { FileDiffList } from "./file-diff-list";
import {
  EdgeDiffList,
  SymbolDiffList,
  countDeduplicatedSymbols,
} from "./symbol-edge-diff-list";
import type { ProjectImport } from "@/features/projects/api";
import type { compareProjectImports } from "../api";

function shortSha(sha: string | null) {
  return sha ? sha.slice(0, 7) : "—";
}

export function CompareDetail({
  base,
  head,
  isLoading,
  comparison,
}: {
  base: ProjectImport | null;
  head: ProjectImport | null;
  isLoading: boolean;
  comparison: Awaited<ReturnType<typeof compareProjectImports>> | undefined;
}) {
  if (!base || !head) {
    return (
      <Empty className="border border-dashed bg-background p-12">
        <EmptyHeader>
          <EmptyTitle>Pick two imports to compare</EmptyTitle>
          <EmptyDescription>
            Select a <strong>base</strong> and a <strong>head</strong> in the
            timeline to see what changed.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (base.id === head.id) {
    return (
      <Empty className="border border-dashed bg-background p-12">
        <EmptyHeader>
          <EmptyTitle>Base and head are the same</EmptyTitle>
          <EmptyDescription>
            Choose two different imports to compute a diff.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-xl">Comparison</CardTitle>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge className="bg-amber-500 text-white hover:bg-amber-500">
            BASE
          </Badge>
          <span className="font-mono text-xs">{shortSha(base.commitSha)}</span>
          <span className="text-muted-foreground">·</span>
          <LocalProjectDate
            value={base.completedAt ?? base.startedAt}
            className="text-xs text-muted-foreground"
          />
          <span className="mx-2 text-muted-foreground">→</span>
          <Badge className="bg-primary text-primary-foreground hover:bg-primary">
            HEAD
          </Badge>
          <span className="font-mono text-xs">{shortSha(head.commitSha)}</span>
          <span className="text-muted-foreground">·</span>
          <LocalProjectDate
            value={head.completedAt ?? head.startedAt}
            className="text-xs text-muted-foreground"
          />
        </div>
        {base.commitMessage || head.commitMessage ? (
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Base commit
              </p>
              <p className="mt-1 line-clamp-2 text-foreground">
                {base.commitMessage ?? "No commit message available"}
              </p>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Head commit
              </p>
              <p className="mt-1 line-clamp-2 text-foreground">
                {head.commitMessage ?? "No commit message available"}
              </p>
            </div>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading || !comparison ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Computing diff…
          </div>
        ) : (
          <>
            <MetricsDeltaGrid metrics={comparison.metrics} />

            <Tabs defaultValue="files">
              <TabsList>
                <TabsTrigger value="files">
                  Files
                  <span className="ml-1.5 tabular-nums text-muted-foreground">
                    {comparison.files.totalAdded +
                      comparison.files.totalRemoved +
                      comparison.files.totalModified}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="symbols">
                  Symbols
                  <span className="ml-1.5 tabular-nums text-muted-foreground">
                    {countDeduplicatedSymbols(comparison.symbols)}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="edges">
                  Dependencies
                  <span className="ml-1.5 tabular-nums text-muted-foreground">
                    {comparison.edges.length}
                  </span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="files" className="mt-4">
                <FileDiffList summary={comparison.files} />
              </TabsContent>
              <TabsContent value="symbols" className="mt-4">
                <SymbolDiffList symbols={comparison.symbols} />
              </TabsContent>
              <TabsContent value="edges" className="mt-4">
                <EdgeDiffList edges={comparison.edges} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}
