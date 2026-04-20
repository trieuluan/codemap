"use client";

import {
  BarChart3,
  Binary,
  Boxes,
  FileCode2,
  FolderTree,
  GitBranch,
  Hash,
  Languages,
  ScanSearch,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFileKind } from "@/lib/file-types";
import type {
  ProjectAnalysisSummary,
  ProjectFileParseData,
  ProjectFileSymbol,
} from "@/lib/api/projects";
import { cn } from "@/lib/utils";
import type { RepositoryTreeNode } from "./file-tree-model";
import { getRepositoryNodeChildCount } from "./file-tree-model";

interface DetailPanelProps {
  file: RepositoryTreeNode;
  parseData?: ProjectFileParseData;
  analysisSummary?: ProjectAnalysisSummary;
  parseDataLoading?: boolean;
  analysisLoading?: boolean;
  activeTab: string;
  onActiveTabChange: (value: string) => void;
  onSelectSymbol: (symbol: ProjectFileSymbol) => void;
}

function getDisplayExtension(file: RepositoryTreeNode) {
  if (file.type === "folder") {
    return "DIRECTORY";
  }

  return (
    file.extension?.toUpperCase() ||
    file.name.split(".").pop()?.toUpperCase() ||
    "FILE"
  );
}

function formatFileSize(sizeBytes?: number | null) {
  if (!sizeBytes) {
    return "Unavailable";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatParseStatusLabel(value?: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return value.replace(/_/g, " ");
}

function getResolutionKindLabel(value: string) {
  switch (value) {
    case "relative_path":
      return "Internal";
    case "tsconfig_alias":
      return "Alias";
    case "package":
      return "Package";
    case "builtin":
      return "Builtin";
    case "unresolved":
      return "Unresolved";
    default:
      return value.replace(/_/g, " ");
  }
}

function getResolutionKindBadgeClassName(value: string) {
  switch (value) {
    case "relative_path":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "tsconfig_alias":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "package":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "builtin":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "unresolved":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function renderBar(value: number, maxValue: number) {
  const width = maxValue > 0 ? Math.max((value / maxValue) * 100, 8) : 0;

  return (
    <div className="h-2 rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary/70"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function EmptyTabState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty className="rounded-lg border border-dashed border-border bg-background/40 p-8">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function DetailPanel({
  file,
  parseData,
  analysisSummary,
  parseDataLoading = false,
  analysisLoading = false,
  activeTab,
  onActiveTabChange,
  onSelectSymbol,
}: DetailPanelProps) {
  const fileKind = getFileKind({
    name: file.name,
    extension: file.extension,
    isDirectory: file.type === "folder",
  });
  const fileExtension = getDisplayExtension(file);
  const childCount = getRepositoryNodeChildCount(file);
  const maxFolderCount = Math.max(
    ...(analysisSummary?.topFolders.map((item) => item.sourceFileCount) ?? [0]),
  );
  const maxLanguageCount = Math.max(
    ...(analysisSummary?.sourceFileDistribution.map((item) => item.fileCount) ?? [0]),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-accent">
            <FileCode2 className="h-5 w-5 text-sidebar-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {fileExtension} • {file.language || parseData?.file.language || "Unknown language"}{" "}
              •{" "}
              {file.type === "folder"
                ? `${childCount} item${childCount === 1 ? "" : "s"}`
                : formatFileSize(parseData?.file.sizeBytes ?? file.size)}
            </p>
          </div>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={onActiveTabChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-border/70 px-4 py-3">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="symbols">Symbols</TabsTrigger>
            <TabsTrigger value="imports">Imports</TabsTrigger>
            <TabsTrigger value="exports">Exports</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="details" className="mt-0 space-y-4">
            <div className="grid gap-4">
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
                  <Badge variant="secondary">
                    {parseData?.file.language || file.language || "Unknown language"}
                  </Badge>
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
                        {formatFileSize(parseData?.file.sizeBytes ?? file.size)}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Line count:</span>{" "}
                        {parseData?.file.lineCount ?? "Unavailable"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">MIME type:</span>{" "}
                        {parseData?.file.mimeType ?? "Unavailable"}
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
            </div>
          </TabsContent>

          <TabsContent value="symbols" className="mt-0">
            {file.type !== "file" ? (
              <EmptyTabState
                title="Outline is available for files"
                description="Select a source file to inspect symbols and jump within the viewer."
              />
            ) : parseDataLoading ? (
              <EmptyTabState
                title="Loading symbols"
                description="Semantic symbol data for this file is still being fetched."
              />
            ) : !parseData ? (
              <EmptyTabState
                title="No parse data yet"
                description="Semantic analysis has not produced file symbols for this selection yet."
              />
            ) : parseData.symbols.length === 0 ? (
              <EmptyTabState
                title="No symbols found"
                description="This file does not currently expose functions, classes, interfaces, or other symbol definitions."
              />
            ) : (
              <div className="space-y-2">
                {parseData.symbols.map((symbol) => (
                  <button
                    key={symbol.id}
                    type="button"
                    onClick={() => onSelectSymbol(symbol)}
                    className="flex w-full items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/70 p-3 text-left transition-colors hover:bg-accent/40"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          {symbol.displayName}
                        </span>
                        <Badge variant="secondary" className="capitalize">
                          {symbol.kind.replace(/_/g, " ")}
                        </Badge>
                        {symbol.isExported ? (
                          <Badge variant="outline">Exported</Badge>
                        ) : null}
                      </div>
                      {symbol.signature ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {symbol.signature}
                        </p>
                      ) : null}
                      {symbol.parentSymbolName ? (
                        <p className="text-xs text-muted-foreground">
                          In {symbol.parentSymbolName}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {symbol.startLine ? `L${symbol.startLine}` : "No range"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="imports" className="mt-0">
            {file.type !== "file" ? (
              <EmptyTabState
                title="Imports are file-specific"
                description="Select a file to inspect its resolved and unresolved imports."
              />
            ) : parseDataLoading ? (
              <EmptyTabState
                title="Loading imports"
                description="Semantic import edges for this file are still being fetched."
              />
            ) : !parseData ? (
              <EmptyTabState
                title="No parse data yet"
                description="Semantic analysis has not produced import information for this file yet."
              />
            ) : parseData.imports.length === 0 ? (
              <EmptyTabState
                title="No imports found"
                description="This file does not currently declare import edges in the semantic index."
              />
            ) : (
              <div className="space-y-2">
                {parseData.imports.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border/70 bg-background/70 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <GitBranch className="size-4 text-muted-foreground" />
                      <p className="break-all font-medium text-foreground">
                        {item.moduleSpecifier}
                      </p>
                      <Badge variant="secondary" className="capitalize">
                        {item.importKind.replace(/_/g, " ")}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "border font-semibold shadow-sm",
                          getResolutionKindBadgeClassName(item.resolutionKind),
                        )}
                      >
                        {getResolutionKindLabel(item.resolutionKind)}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p>
                        Resolution kind: {getResolutionKindLabel(item.resolutionKind)}
                      </p>
                      <p>
                        Target:{" "}
                        {item.targetPathText ??
                          item.targetExternalSymbolKey ??
                          "Unknown target"}
                      </p>
                      <p>
                        Location: L{item.startLine}:{item.startCol}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="exports" className="mt-0">
            {file.type !== "file" ? (
              <EmptyTabState
                title="Exports are file-specific"
                description="Select a file to inspect its export surface."
              />
            ) : parseDataLoading ? (
              <EmptyTabState
                title="Loading exports"
                description="Semantic export data for this file is still being fetched."
              />
            ) : !parseData ? (
              <EmptyTabState
                title="No parse data yet"
                description="Semantic analysis has not produced export information for this file yet."
              />
            ) : parseData.exports.length === 0 ? (
              <EmptyTabState
                title="No exports found"
                description="This file does not currently expose named, default, wildcard, or re-exports."
              />
            ) : (
              <div className="space-y-2">
                {parseData.exports.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border/70 bg-background/70 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Binary className="size-4 text-muted-foreground" />
                      <p className="font-medium text-foreground">
                        {item.exportName}
                      </p>
                      <Badge variant="secondary" className="capitalize">
                        {item.exportKind.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p>Symbol: {item.symbolDisplayName ?? "Not linked"}</p>
                      <p>
                        Source module: {item.sourceModuleSpecifier ?? "Local export"}
                      </p>
                      <p>
                        Location: L{item.startLine}:{item.startCol}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analysis" className="mt-0 space-y-4">
            {analysisLoading ? (
              <EmptyTabState
                title="Loading analysis"
                description="Project-level semantic analysis is still being fetched."
              />
            ) : !analysisSummary ? (
              <EmptyTabState
                title="Analysis is unavailable"
                description="Project-level semantic analysis has not been loaded yet."
              />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <ScanSearch className="size-4 text-muted-foreground" />
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Totals
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Files</p>
                        <p className="text-lg font-semibold">
                          {analysisSummary.totals.files}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Source files</p>
                        <p className="text-lg font-semibold">
                          {analysisSummary.totals.sourceFiles}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Parsed files</p>
                        <p className="text-lg font-semibold">
                          {analysisSummary.totals.parsedFiles}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Dependencies</p>
                        <p className="text-lg font-semibold">
                          {analysisSummary.totals.dependencies}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Boxes className="size-4 text-muted-foreground" />
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Symbols
                      </p>
                    </div>
                    <p className="text-3xl font-semibold text-foreground">
                      {analysisSummary.totals.symbols}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Semantic symbols extracted for the current map import.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <BarChart3 className="size-4 text-muted-foreground" />
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Top files by dependencies
                    </p>
                  </div>
                  {analysisSummary.topFilesByDependencies.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No dependency edges have been indexed yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {analysisSummary.topFilesByDependencies.map((item) => (
                        <div key={item.path} className="space-y-1">
                          <p className="truncate font-mono text-xs text-foreground">
                            {item.path}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Outgoing {item.outgoingCount} • Incoming {item.incomingCount}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <FolderTree className="size-4 text-muted-foreground" />
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Top folders
                    </p>
                  </div>
                  {analysisSummary.topFolders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Folder distribution is not available yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {analysisSummary.topFolders.map((item) => (
                        <div key={item.folder} className="space-y-1">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-foreground">{item.folder}</span>
                            <span className="text-muted-foreground">
                              {item.sourceFileCount}
                            </span>
                          </div>
                          {renderBar(item.sourceFileCount, maxFolderCount)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Languages className="size-4 text-muted-foreground" />
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Source file distribution
                    </p>
                  </div>
                  {analysisSummary.sourceFileDistribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Language distribution is not available yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {analysisSummary.sourceFileDistribution.map((item) => (
                        <div key={item.language} className="space-y-1">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-foreground">
                              {item.language}
                            </span>
                            <span className="text-muted-foreground">
                              {item.fileCount}
                            </span>
                          </div>
                          {renderBar(item.fileCount, maxLanguageCount)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
