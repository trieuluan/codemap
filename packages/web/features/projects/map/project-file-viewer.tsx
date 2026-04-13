"use client";

import { AlertCircle, FileCode2, FileWarning, FolderSearch, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectsApiError, ProjectFileContent } from "@/lib/api/projects";
import type { RepositoryTreeNode } from "./file-tree-model";

interface ProjectFileViewerProps {
  selectedNode: RepositoryTreeNode | null;
  fileContent?: ProjectFileContent;
  isLoading: boolean;
  error?: ProjectsApiError;
  onRetry: () => void;
}

function ViewerHeader({
  title,
  subtitle,
  badges,
}: {
  title: string;
  subtitle: string;
  badges?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/70 px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-foreground">{title}</p>
          <p className="break-all font-mono text-xs text-muted-foreground">
            {subtitle}
          </p>
        </div>
        {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
      </div>
    </div>
  );
}

function LoadingViewer() {
  return (
    <div className="flex h-full flex-col">
      <ViewerHeader
        title="Loading file content"
        subtitle="Fetching the latest retained file preview."
      />
      <div className="flex-1 space-y-4 p-6">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-32" />
        </div>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    </div>
  );
}

function EmptyViewer({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon: typeof FolderSearch;
}) {
  return (
    <div className="flex h-full flex-col">
      <ViewerHeader title={title} subtitle={description} />
      <Empty className="h-full rounded-none border-0 bg-transparent p-10">
        <EmptyHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-muted">
            <Icon className="size-6 text-muted-foreground" />
          </div>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {action ? <EmptyContent>{action}</EmptyContent> : null}
      </Empty>
    </div>
  );
}

export function ProjectFileViewer({
  selectedNode,
  fileContent,
  isLoading,
  error,
  onRetry,
}: ProjectFileViewerProps) {
  if (!selectedNode || selectedNode.type !== "file") {
    return (
      <EmptyViewer
        title="No file selected"
        description="Select a file in the repository tree to preview its contents here."
        icon={FolderSearch}
      />
    );
  }

  if (isLoading) {
    return <LoadingViewer />;
  }

  if (error) {
    return (
      <EmptyViewer
        title="Error loading file"
        description={error.message || "The file preview request failed."}
        icon={AlertCircle}
        action={
          <Button variant="outline" onClick={onRetry}>
            <RefreshCcw className="size-4" />
            Retry
          </Button>
        }
      />
    );
  }

  if (!fileContent) {
    return (
      <EmptyViewer
        title="File preview unavailable"
        description="The preview has not loaded yet for this file."
        icon={FileWarning}
      />
    );
  }

  const badges = (
    <>
      <Badge variant="secondary">{fileContent.extension?.toUpperCase() || "FILE"}</Badge>
      <Badge variant="secondary">
        {fileContent.language || selectedNode.language || "Unknown language"}
      </Badge>
      {fileContent.sizeBytes ? (
        <Badge variant="secondary">
          {(fileContent.sizeBytes / 1024).toFixed(1)} KB
        </Badge>
      ) : null}
    </>
  );

  if (fileContent.status !== "ready") {
    return (
      <EmptyViewer
        title="Preview not available"
        description={
          fileContent.reason ||
          "This file cannot be previewed in the current lightweight viewer."
        }
        icon={FileWarning}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ViewerHeader
        title={fileContent.name}
        subtitle={fileContent.path}
        badges={badges}
      />
      <div className="flex-1 overflow-auto bg-background/30 p-6">
        <div className="rounded-lg border border-border/70 bg-background/80 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
            <FileCode2 className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Retained source preview
            </p>
          </div>
          <pre className="overflow-x-auto p-4 text-sm leading-6 text-foreground">
            <code>{fileContent.content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
