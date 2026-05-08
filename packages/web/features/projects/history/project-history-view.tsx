"use client";

import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { compareProjectImports } from "./api";
import { ImportTimeline } from "./components/import-timeline";
import { SingleImportDetail } from "./components/single-import-detail";
import { CompareDetail } from "./components/compare-detail";

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
      <div className="flex flex-wrap items-center gap-3 rounded-lg border glass-card p-3 shadow-sm">
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
