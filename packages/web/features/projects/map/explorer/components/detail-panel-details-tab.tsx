"use client";

import Link from "next/link";
import {
  FileCode2,
  FolderTree,
  Hash,
  Network,
  ScanSearch,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getFileKind } from "@/lib/file-types";
import type {
  ProjectAnalysisSummary,
  ProjectFileContent,
  ProjectFileParseData,
} from "@/features/projects/api";
import type { RepositoryTreeNode } from "../utils/file-tree-model";
import { getRepositoryNodeChildCount } from "../utils/file-tree-model";
import {
  formatFileSize,
  formatParseStatusLabel,
  formatPlural,
  getDisplayExtension,
  getLineCountFallback,
  getMimeTypeFallback,
  EmptyTabState,
} from "./detail-panel-shared";

interface DetailPanelDetailsTabProps {
  projectId: string;
  file: RepositoryTreeNode;
  fileContent?: ProjectFileContent;
  parseData?: ProjectFileParseData;
  analysisSummary?: ProjectAnalysisSummary;
  parseDataLoading?: boolean;
  onNavigateToFile: (
    path: string,
    tab?: string,
    range?: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    },
  ) => void;
}

export function DetailPanelDetailsTab({
  projectId,
  file,
  fileContent,
  parseData,
  analysisSummary,
  parseDataLoading = false,
  onNavigateToFile,
}: DetailPanelDetailsTabProps) {
  const fileKind = getFileKind({
    name: file.name,
    extension: file.extension,
    isDirectory: file.type === "folder",
  });
  const fileExtension = getDisplayExtension(file);
  const childCount = getRepositoryNodeChildCount(file);
  const detailLanguage =
    parseData?.file.language ||
    fileContent?.language ||
    file.language ||
    "Unknown language";
  const detailSize = formatFileSize(
    parseData?.file.sizeBytes ?? fileContent?.sizeBytes ?? file.size,
  );
  const detailLineCount = getLineCountFallback(
    parseData?.file.lineCount,
    fileContent?.content,
  );
  const detailMimeType = getMimeTypeFallback(
    parseData?.file.mimeType ?? fileContent?.mimeType,
    parseData?.file.extension ?? file.extension,
  );

  return (
    <div className="grid gap-4">
      <div className="border-b border-sidebar-border px-2 py-1">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
            <FileCode2 className="h-5 w-5 text-sidebar-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {fileExtension} • {detailLanguage} •{" "}
              {file.type === "folder"
                ? `${childCount} item${childCount === 1 ? "" : "s"}`
                : detailSize}
            </p>
          </div>
          {file.type === "file" && file.path ? (
            <Link
              href={`/projects/${projectId}/map/graph?file=${encodeURIComponent(file.path)}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-background/70 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="View in Graph"
            >
              <Network className="size-3.5" />
              Graph
            </Link>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-background/70 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Tag className="size-4 text-muted-foreground" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Classification
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {file.type === "folder" ? "Directory" : "File"}
          </Badge>
          <Badge variant="secondary" className="capitalize">
            {fileKind}
          </Badge>
          <Badge variant="secondary">{detailLanguage}</Badge>
          {parseData ? (
            <Badge variant="outline" className="capitalize">
              {formatParseStatusLabel(parseData.file.parseStatus)}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-background/70 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Hash className="size-4 text-muted-foreground" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Technical
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Extension:</span>{" "}
            {fileExtension}
          </p>
          <p>
            <span className="text-muted-foreground">Kind:</span>{" "}
            <span className="capitalize">{fileKind}</span>
          </p>
          {file.type === "folder" ? (
            <p>
              <span className="text-muted-foreground">Children:</span>{" "}
              {childCount}
            </p>
          ) : (
            <>
              <p>
                <span className="text-muted-foreground">Size:</span>{" "}
                {detailSize}
              </p>
              <p>
                <span className="text-muted-foreground">Line count:</span>{" "}
                {detailLineCount}
              </p>
              <p>
                <span className="text-muted-foreground">MIME type:</span>{" "}
                {detailMimeType}
              </p>
              <p>
                <span className="text-muted-foreground">Import parse:</span>{" "}
                <span className="capitalize">
                  {formatParseStatusLabel(parseData?.file.importParseStatus)}
                </span>
              </p>
            </>
          )}
        </div>
      </div>

      {file.type === "file" ? (
        <div className="rounded-lg border border-border/70 bg-background/70 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ScanSearch className="size-4 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Blast radius
            </p>
          </div>
          {parseDataLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !parseData ? (
            <p className="text-sm text-muted-foreground">
              Blast radius is unavailable until semantic analysis indexes this
              file.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {parseData.blastRadius.totalCount > 0
                    ? `Changing this file may impact ${formatPlural(
                        parseData.blastRadius.totalCount,
                        "file",
                      )}.`
                    : "No internal dependents found."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    Direct: {parseData.blastRadius.directCount}
                  </Badge>
                  <Badge variant="secondary">
                    Transitive: {parseData.blastRadius.totalCount}
                  </Badge>
                  <Badge variant="secondary">
                    Max depth: {parseData.blastRadius.maxDepth}
                  </Badge>
                  {parseData.blastRadius.hasCycles ? (
                    <Badge variant="destructive">Cycle risk</Badge>
                  ) : null}
                </div>
              </div>

              {parseData.blastRadius.files.length > 0 ? (
                <div className="space-y-2">
                  {parseData.blastRadius.files.map((item) => (
                    <button
                      key={`${item.path}:${item.depth}`}
                      type="button"
                      onClick={() => onNavigateToFile(item.path, "relationships")}
                      className="flex w-full items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/70 p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="break-all font-mono text-xs font-medium text-foreground">
                          {item.path}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.language ?? "Unknown language"} · depth{" "}
                          {item.depth}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-[10px] text-muted-foreground">
                        <p>↓{item.incomingCount}</p>
                        <p>↑{item.outgoingCount}</p>
                      </div>
                    </button>
                  ))}
                  {parseData.blastRadius.totalCount >
                  parseData.blastRadius.files.length ? (
                    <p className="text-xs text-muted-foreground">
                      Showing {parseData.blastRadius.files.length} of{" "}
                      {parseData.blastRadius.totalCount} impacted files.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-lg border border-border/70 bg-background/70 p-4">
        <div className="mb-3 flex items-center gap-2">
          <FolderTree className="size-4 text-muted-foreground" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Repository path
          </p>
        </div>
        <div className="rounded-md bg-sidebar-accent/40 p-3">
          <p className="break-all font-mono text-xs text-foreground">
            {file.path || file.name}
          </p>
        </div>
      </div>

      {file.type === "folder" && !analysisSummary ? (
        <EmptyTabState
          title="Folder details are limited"
          description="Project analysis will add more semantic context once it is available."
        />
      ) : null}
    </div>
  );
}
