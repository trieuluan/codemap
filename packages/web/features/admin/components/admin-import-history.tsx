"use client";

import { useCallback, useEffect, useState } from "react";
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
import type { ProjectImport } from "@/features/projects/api";
import { ProjectImportStatusBadge } from "@/features/projects/components/project-import-status-badge";
import {
  listAdminProjectImports,
  type AdminProjectImportsResponse,
} from "@/features/admin/api";

const PAGE_SIZE = 15;

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
  const [response, setResponse] = useState<
    AdminProjectImportsResponse<ProjectImport> | null
  >(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(true);

  const currentResponse = response;

  const loadPage = useCallback(async (nextPage: number) => {
    setError(false);
    setIsLoadingPage(true);

    try {
      const fresh = await listAdminProjectImports(projectId, {
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setResponse(fresh);
      setPage(fresh.pagination.page);
    } catch {
      setError(true);
    } finally {
      setIsLoadingPage(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const imports = currentResponse?.items ?? [];
  const pagination = currentResponse?.pagination ?? {
    page,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  };
  const isInitialLoading = currentResponse === null && isLoadingPage;
  const isEmpty = !isInitialLoading && imports.length === 0;

  if (isInitialLoading) {
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

  if (error && currentResponse === null) {
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

  const showingStart = pagination.total === 0
    ? 0
    : (pagination.page - 1) * pagination.pageSize + 1;
  const showingEnd = Math.min(
    pagination.total,
    (pagination.page - 1) * pagination.pageSize + imports.length,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import History</CardTitle>
        <CardDescription>
          {pagination.total.toLocaleString()} import
          {pagination.total !== 1 ? "s" : ""} found · page {pagination.page} of{" "}
          {pagination.totalPages}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Failed to refresh imports. Showing the last loaded page.
          </p>
        )}
        <div className="space-y-3">
          {imports.map((imp) => (
            <ImportRow key={imp.id} imp={imp} />
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {showingStart.toLocaleString()}-{showingEnd.toLocaleString()} of{" "}
            {pagination.total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isLoadingPage || pagination.page <= 1}
              onClick={() => loadPage(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoadingPage || pagination.page >= pagination.totalPages}
              onClick={() => loadPage(pagination.page + 1)}
            >
              {isLoadingPage ? <Spinner className="mr-2 size-4" /> : null}
              Next
            </Button>
          </div>
        </div>
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
