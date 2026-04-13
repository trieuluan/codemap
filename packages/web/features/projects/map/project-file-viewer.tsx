"use client";

import { useState } from "react";
import {
  AlertCircle,
  File,
  FileCode2,
  FileImage,
  FileWarning,
  FolderSearch,
  ImageOff,
  RefreshCcw,
} from "lucide-react";
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
import {
  buildProjectRawFileUrl,
  type ProjectFileContent,
  type ProjectsApiError,
} from "@/lib/api/projects";
import type { RepositoryTreeNode } from "./file-tree-model";

interface ProjectFileViewerProps {
  projectId: string;
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

function formatFileSize(sizeBytes: number | null) {
  if (!sizeBytes) {
    return null;
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

function ViewerBadges({
  fileContent,
  selectedNode,
}: {
  fileContent: ProjectFileContent;
  selectedNode: RepositoryTreeNode;
}) {
  const sizeLabel = formatFileSize(fileContent.sizeBytes);

  return (
    <>
      <Badge variant="secondary">
        {fileContent.extension?.toUpperCase() || "FILE"}
      </Badge>
      <Badge variant="secondary">
        {fileContent.language || selectedNode.language || "Unknown language"}
      </Badge>
      <Badge variant="secondary">
        {fileContent.kind === "text"
          ? "Text preview"
          : fileContent.kind === "image"
            ? "Image preview"
            : "Binary file"}
      </Badge>
      {fileContent.mimeType ? (
        <Badge variant="secondary" className="max-w-full truncate">
          {fileContent.mimeType}
        </Badge>
      ) : null}
      {sizeLabel ? <Badge variant="secondary">{sizeLabel}</Badge> : null}
    </>
  );
}

function TextFileViewer({
  fileContent,
  selectedNode,
}: {
  fileContent: ProjectFileContent;
  selectedNode: RepositoryTreeNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <ViewerHeader
        title={fileContent.name}
        subtitle={fileContent.path}
        badges={
          <ViewerBadges fileContent={fileContent} selectedNode={selectedNode} />
        }
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

function ImageFileViewer({
  fileContent,
  selectedNode,
  projectId,
}: {
  fileContent: ProjectFileContent;
  selectedNode: RepositoryTreeNode;
  projectId: string;
}) {
  const [hasImageLoadError, setHasImageLoadError] = useState(false);

  if (hasImageLoadError) {
    return (
      <EmptyViewer
        title="Image preview unavailable"
        description="The browser could not load this retained image preview."
        icon={ImageOff}
      />
    );
  }
  console.log(buildProjectRawFileUrl(projectId, fileContent.path));
  return (
    <div className="flex h-full flex-col">
      <ViewerHeader
        title={fileContent.name}
        subtitle={fileContent.path}
        badges={
          <ViewerBadges fileContent={fileContent} selectedNode={selectedNode} />
        }
      />
      <div className="flex flex-1 overflow-auto bg-background/30 p-6">
        <div className="flex min-h-full w-full items-center justify-center rounded-lg border border-border/70 bg-background/80 p-6 shadow-sm">
          <img
            src={buildProjectRawFileUrl(projectId, fileContent.path)}
            alt={fileContent.name}
            className="max-h-full max-w-full rounded-md object-contain shadow-sm"
            onError={() => setHasImageLoadError(true)}
          />
        </div>
      </div>
    </div>
  );
}

function BlockedFileViewer({
  fileContent,
  selectedNode,
  title,
  description,
  icon: Icon,
}: {
  fileContent: ProjectFileContent;
  selectedNode: RepositoryTreeNode;
  title: string;
  description: string;
  icon: typeof FileWarning;
}) {
  return (
    <div className="flex h-full flex-col">
      <ViewerHeader
        title={fileContent.name}
        subtitle={fileContent.path}
        badges={
          <ViewerBadges fileContent={fileContent} selectedNode={selectedNode} />
        }
      />
      <Empty className="h-full rounded-none border-0 bg-transparent p-10">
        <EmptyHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-muted">
            <Icon className="size-6 text-muted-foreground" />
          </div>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            {fileContent.mimeType ? (
              <Badge variant="outline">{fileContent.mimeType}</Badge>
            ) : null}
            <Badge variant="outline">
              {fileContent.extension?.toUpperCase() || "FILE"}
            </Badge>
            {fileContent.sizeBytes ? (
              <Badge variant="outline">
                {formatFileSize(fileContent.sizeBytes)}
              </Badge>
            ) : null}
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}

export function ProjectFileViewer({
  projectId,
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

  if (fileContent.status === "ready" && fileContent.kind === "image") {
    return (
      <ImageFileViewer
        fileContent={fileContent}
        selectedNode={selectedNode}
        projectId={projectId}
      />
    );
  }

  if (fileContent.status === "ready" && fileContent.kind === "text") {
    return (
      <TextFileViewer fileContent={fileContent} selectedNode={selectedNode} />
    );
  }

  if (fileContent.status === "too_large") {
    return (
      <BlockedFileViewer
        fileContent={fileContent}
        selectedNode={selectedNode}
        title="File preview is too large"
        description={
          fileContent.reason ||
          "This file exceeds the current preview size limit."
        }
        icon={File}
      />
    );
  }

  if (fileContent.status === "binary") {
    return (
      <BlockedFileViewer
        fileContent={fileContent}
        selectedNode={selectedNode}
        title="Binary preview not available"
        description={
          fileContent.reason ||
          "This file cannot be previewed as text in the current lightweight viewer."
        }
        icon={FileImage}
      />
    );
  }

  return (
    <BlockedFileViewer
      fileContent={fileContent}
      selectedNode={selectedNode}
      title="Preview not available"
      description={
        fileContent.reason ||
        "This file cannot be previewed in the current lightweight viewer."
      }
      icon={FileWarning}
    />
  );
}
