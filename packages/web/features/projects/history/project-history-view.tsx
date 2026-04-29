"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { GitCompare, GitCommit, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { browserProjectsApi, type ProjectImport } from "@/features/projects/api";
import { LocalProjectDate } from "@/features/projects/components/local-project-date";
import { compareProjectImports } from "./api";
import { ImportTimeline } from "./components/import-timeline";
import { MetricsDeltaGrid } from "./components/metrics-delta-grid";
import { FileDiffList } from "./components/file-diff-list";
import {
  EdgeDiffList,
  SymbolDiffList,
} from "./components/symbol-edge-diff-list";

interface Props {
  projectId: string;
  initialImports: ProjectImport[];
}

function shortSha(sha: string | null) {
  return sha ? sha.slice(0, 7) : "—";
}

export function ProjectHistoryView({ projectId, initialImports }: Props) {
  const { data: imports = initialImports } = useSWR(
    ["project-imports", projectId],
    () => browserProjectsApi.getProjectImports(projectId),
    {
      fallbackData: initialImports,
      revalidateOnFocus: false,
    },
  );

  // Default: select latest, set up compare with previous
  const [compareMode, setCompareMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    imports[0]?.id ?? null,
  );
  const [baseId, setBaseId] = useState<string | null>(imports[1]?.id ?? null);
  const [headId, setHeadId] = useState<string | null>(imports[0]?.id ?? null);

  const base = useMemo(
    () => imports.find((i) => i.id === baseId) ?? null,
    [imports, baseId],
  );
  const head = useMemo(
    () => imports.find((i) => i.id === headId) ?? null,
    [imports, headId],
  );

  const comparisonKey =
    compareMode && base && head ? ["compare", projectId, base.id, head.id] : null;

  const { data: comparison, isLoading: isCompareLoading } = useSWR(
    comparisonKey,
    () => compareProjectImports(projectId, base!, head!),
    { revalidateOnFocus: false },
  );

  if (imports.length === 0) {
    return (
      <Empty className="border border-dashed bg-background p-12">
        <EmptyHeader>
          <EmptyTitle>No imports yet</EmptyTitle>
          <EmptyDescription>
            Run the first import to start building project history.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      {/* LEFT: timeline */}
      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">
            Imports{" "}
            <span className="ml-1 text-sm font-normal text-muted-foreground tabular-nums">
              ({imports.length})
            </span>
          </CardTitle>
          {compareMode ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCompareMode(false)}
            >
              <X className="size-4" />
              Exit compare
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCompareMode(true);
                if (!headId) setHeadId(imports[0]?.id ?? null);
                if (!baseId) setBaseId(imports[1]?.id ?? null);
              }}
              disabled={imports.length < 2}
            >
              <GitCompare className="size-4" />
              Compare
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ImportTimeline
            imports={imports}
            selectedId={selectedId}
            baseId={baseId}
            headId={headId}
            compareMode={compareMode}
            onSelect={setSelectedId}
            onSetBase={setBaseId}
            onSetHead={setHeadId}
          />
        </CardContent>
      </Card>

      {/* RIGHT: detail or compare */}
      <div className="space-y-6">
        {compareMode ? (
          <CompareDetail
            base={base}
            head={head}
            isLoading={isCompareLoading}
            comparison={comparison}
          />
        ) : (
          <SingleImportDetail
            imp={imports.find((i) => i.id === selectedId) ?? imports[0]!}
            previous={
              imports[
                imports.findIndex(
                  (i) => i.id === (selectedId ?? imports[0]!.id),
                ) + 1
              ] ?? null
            }
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SingleImportDetail({
  imp,
  previous,
}: {
  imp: ProjectImport;
  previous: ProjectImport | null;
}) {
  const metrics = previous
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
        <CardTitle className="text-xl">
          Import details
        </CardTitle>
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CompareDetail({
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
                    {comparison.symbols.length}
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
