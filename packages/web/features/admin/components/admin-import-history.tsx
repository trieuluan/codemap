"use client";

import { useCallback } from "react";
import useSWRInfinite from "swr/infinite";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { requestApi } from "@/lib/api/client";
import type { ProjectImport } from "@/features/projects/api";
import { ProjectImportStatusBadge } from "@/features/projects/components/project-import-status-badge";

const PAGE_SIZE = 15;

interface ImportsResponse {
  items: ProjectImport[];
  nextCursor: string | null;
}

async function fetchImports(
  projectId: string,
  cursor?: string,
): Promise<ImportsResponse> {
  const items = await requestApi<ProjectImport[]>(
    `/admin/projects/${projectId}/imports`,
    {
      queryParams: {
        limit: PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      },
    },
  );

  const lastItem = items[items.length - 1];
  const hasMore = items.length === PAGE_SIZE;
  const nextCursor = hasMore && lastItem?.startedAt
    ? new Date(lastItem.startedAt).toISOString()
    : null;

  return { items, nextCursor };
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortSha(value: string | null) {
  return value ? value.slice(0, 7) : "—";
}

function formatNumber(value: number | null | undefined) {
  return value?.toLocaleString() ?? "—";
}

export function AdminImportHistory({ projectId }: { projectId: string }) {
  const getKey = useCallback(
    (pageIndex: number, previousPageData: ImportsResponse | null) => {
      if (previousPageData && !previousPageData.nextCursor) return null;
      if (pageIndex === 0) return [projectId, undefined];
      return [projectId, previousPageData?.nextCursor];
    },
    [projectId],
  );

  const { data, size, setSize, isLoading, isValidating, error } =
    useSWRInfinite<ImportsResponse, Error>(
      getKey,
      ([_id, cursor]) => fetchImports(_id, cursor as string | undefined),
      {
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 5000,
      },
    );

  const allImports = data?.flatMap((page) => page.items) ?? [];
  const hasNextPage = data && data.length > 0
    ? data[data.length - 1]?.nextCursor !== null
    : false;

  const isLoadingMore = isValidating && size > 0 && data && data.length !== 0;
  const isEmpty = !isLoading && !isValidating && allImports.length === 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import History</CardTitle>
          <CardDescription>Loading imports...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Spinner className="size-6" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import History</CardTitle>
          <CardDescription>
            <span className="text-destructive">Failed to load imports.</span>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isEmpty) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import History</CardTitle>
          <CardDescription>No imports for this project yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No import history found. Trigger an import from the workspace
            project page to start tracking changes.
          </div>
        </CardContent>
      </Card>
    );
  }

  function handleLoadMore() {
    if (hasNextPage && !isLoadingMore) {
      setSize(size + 1);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import History</CardTitle>
        <CardDescription>
          {allImports.length} import{allImports.length !== 1 ? "s" : ""} found.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {allImports.map((imp) => (
            <ImportRow key={imp.id} imp={imp} />
          ))}
        </div>

        {hasNextPage && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              disabled={isLoadingMore}
              onClick={handleLoadMore}
            >
              {isLoadingMore ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Loading more...
                </>
              ) : (
                "Load more"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImportRow({ imp }: { imp: ProjectImport }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 p-3 transition-colors hover:bg-muted/30">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-mono text-xs text-muted-foreground">
            {shortSha(imp.commitSha)}
          </p>
          {imp.branch && (
            <Badge variant="secondary" className="text-xs">
              {imp.branch}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Started {formatDate(imp.startedAt)}
          {imp.completedAt && ` · Completed ${formatDate(imp.completedAt)}`}
        </p>
        {imp.parseStatsJson && (
          <p className="mt-1 text-xs text-muted-foreground">
            {formatNumber(imp.parseStatsJson.parsedFileCount ?? imp.indexedFileCount)} files ·{" "}
            {formatNumber(imp.parseStatsJson.dependencyCount ?? imp.indexedEdgeCount)} deps
          </p>
        )}
        {imp.commitMessage && (
          <p className="mt-1 truncate text-xs text-muted-foreground italic">
            &quot;{imp.commitMessage}&quot;
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ProjectImportStatusBadge status={imp.status} />
        {imp.parseStatus && imp.status === "completed" && (
          <Badge variant="outline" className="text-xs">
            {imp.parseStatus}
          </Badge>
        )}
      </div>
    </div>
  );
}
