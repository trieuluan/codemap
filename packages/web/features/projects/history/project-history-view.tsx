"use client";

import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { useMemo, useState } from "react";
import { ArrowLeftRight, GitCommit, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  browserProjectsApi,
  type ProjectImport,
} from "@/features/projects/api";
import { LocalProjectDate } from "@/features/projects/components/local-project-date";
import { compareProjectImports } from "./api";
import { ImportTimeline } from "./components/import-timeline";
import { MetricsDeltaGrid } from "./components/metrics-delta-grid";
import { FileDiffList } from "./components/file-diff-list";
import {
  EdgeDiffList,
  SymbolDiffList,
  countDeduplicatedSymbols,
} from "./components/symbol-edge-diff-list";
import type { MetricDelta } from "./types";

interface Props {
  projectId: string;
  initialImports: ProjectImport[];
}

function shortSha(sha: string | null) {
  return sha ? sha.slice(0, 7) : "—";
}

function formatImportOption(importRecord: ProjectImport) {
  const sha = shortSha(importRecord.commitSha);
  const date = new Date(
    importRecord.completedAt ?? importRecord.startedAt,
  ).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${sha} · ${date}`;
}

export function ProjectHistoryView({ projectId, initialImports }: Props) {
  const { data: pages } = useSWRInfinite(
    (pageIndex, previousPage: { data: ProjectImport[]; meta: { nextCursor: string | null } } | null) => {
      if (pageIndex > 0 && !previousPage?.meta.nextCursor) return null;
      return ["project-imports-page", projectId, previousPage?.meta.nextCursor ?? null];
    },
    ([, pid, cursor]: [string, string, string | null]) =>
      browserProjectsApi.getProjectImportPage(pid, { limit: 50, cursor: cursor ?? undefined }),
    {
      fallbackData: [{ data: initialImports, meta: { nextCursor: null } }],
      revalidateOnFocus: false,
      revalidateFirstPage: false,
    },
  );

  const imports = useMemo(
    () => pages?.flatMap((page) => page.data) ?? initialImports,
    [pages, initialImports],
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
  const selectedImport =
    imports.find((i) => i.id === selectedId) ?? imports[0]!;
  const selectedIndex = imports.findIndex((i) => i.id === selectedImport.id);
  const previousImport =
    selectedIndex >= 0 ? (imports[selectedIndex + 1] ?? null) : null;
  const importsApart =
    base && head
      ? Math.abs(
          imports.findIndex((item) => item.id === base.id) -
            imports.findIndex((item) => item.id === head.id),
        )
      : null;

  const comparisonKey =
    compareMode && base && head
      ? ["compare", projectId, base.id, head.id]
      : null;

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={compareMode ? "compare" : "single"}
          onValueChange={(value: string) => {
            if (!value) return;
            const nextCompareMode = value === "compare";
            setCompareMode(nextCompareMode);
            if (nextCompareMode) {
              if (!headId) setHeadId(imports[0]?.id ?? null);
              if (!baseId) setBaseId(imports[1]?.id ?? null);
            }
          }}
        >
          <ToggleGroupItem value="single">Single</ToggleGroupItem>
          <ToggleGroupItem
            className="px-3"
            value="compare"
            disabled={imports.length < 2}
          >
            Compare
          </ToggleGroupItem>
        </ToggleGroup>

        {compareMode ? (
          <>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Base
            </label>
            <Select
              value={baseId ?? ""}
              onValueChange={(value: string) => setBaseId(value || null)}
            >
              <SelectTrigger className="min-w-44 data-[size=default]:h-8">
                <SelectValue placeholder="Select base" />
              </SelectTrigger>
              <SelectContent>
                {imports.map((importRecord) => (
                  <SelectItem key={importRecord.id} value={importRecord.id}>
                    {formatImportOption(importRecord)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Swap base and head imports"
              onClick={() => {
                setBaseId(headId);
                setHeadId(baseId);
              }}
              className="size-8"
              disabled={!baseId || !headId}
            >
              <ArrowLeftRight className="size-4" />
            </Button>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Head
            </label>
            <Select
              value={headId ?? ""}
              onValueChange={(value: string) => setHeadId(value || null)}
            >
              <SelectTrigger className="min-w-44 data-[size=default]:h-8">
                <SelectValue placeholder="Select head" />
              </SelectTrigger>
              <SelectContent>
                {imports.map((importRecord) => (
                  <SelectItem key={importRecord.id} value={importRecord.id}>
                    {formatImportOption(importRecord)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {importsApart !== null ? (
              <span className="ml-auto text-sm text-muted-foreground">
                {importsApart.toLocaleString()} import
                {importsApart === 1 ? "" : "s"} apart
              </span>
            ) : null}
          </>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">
            Click an import on the left for full details. Switch to{" "}
            <strong className="text-foreground">Compare </strong>
            to diff two imports.
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-3">
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
        </div>

        <div className="space-y-4">
          {compareMode ? (
            <CompareDetail
              base={base}
              head={head}
              isLoading={isCompareLoading}
              comparison={comparison}
            />
          ) : (
            <SingleImportDetail
              imp={selectedImport}
              previous={previousImport}
            />
          )}
        </div>
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
