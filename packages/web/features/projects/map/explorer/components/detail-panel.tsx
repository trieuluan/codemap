"use client";

import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Binary,
  Boxes,
  ExternalLink,
  FileCode2,
  FolderTree,
  GitBranch,
  Hash,
  Languages,
  Network,
  ScanSearch,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFileKind } from "@/lib/file-types";
import type {
  ProjectAnalysisSummary,
  ProjectFileContent,
  ProjectFileExport,
  ProjectFileIncomingImportEdge,
  ProjectFileImportEdge,
  ProjectFileParseData,
  ProjectFileSymbol,
} from "@/features/projects/api";
import { cn } from "@/lib/utils";
import type { RepositoryTreeNode } from "../utils/file-tree-model";
import { getRepositoryNodeChildCount } from "../utils/file-tree-model";

interface DetailPanelProps {
  projectId: string;
  file: RepositoryTreeNode;
  fileContent?: ProjectFileContent;
  parseData?: ProjectFileParseData;
  analysisSummary?: ProjectAnalysisSummary;
  parseDataLoading?: boolean;
  analysisLoading?: boolean;
  activeTab: string;
  onActiveTabChange: (value: string) => void;
  openRelationshipSections: string[];
  onOpenRelationshipSectionsChange: (value: string[]) => void;
  onNavigateToSymbol: (symbol: ProjectFileSymbol) => void;
  onNavigateToImport: (item: ProjectFileImportEdge) => void;
  onNavigateToIncomingImport: (item: ProjectFileIncomingImportEdge) => void;
  onNavigateToExport: (item: ProjectFileExport) => void;
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
  if (sizeBytes == null) {
    return "—";
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
    return "—";
  }

  return value.replace(/_/g, " ");
}

function getLineCountFallback(
  lineCount?: number | null,
  content?: string | null,
) {
  if (lineCount != null) {
    return String(lineCount);
  }

  if (typeof content === "string") {
    return String(content.split(/\r?\n/).length);
  }

  return "—";
}

function getMimeTypeFallback(
  mimeType?: string | null,
  extension?: string | null,
) {
  if (mimeType) {
    return mimeType;
  }

  switch (extension?.toLowerCase()) {
    case ".yaml":
    case ".yml":
      return "application/yaml";
    case ".json":
      return "application/json";
    case ".md":
      return "text/markdown";
    case ".toml":
      return "application/toml";
    case ".ico":
      return "image/x-icon";
    case ".env":
    case ".txt":
    case ".conf":
    case ".ini":
    case ".lock":
      return "text/plain";
    case ".xml":
      return "application/xml";
    case ".svg":
      return "image/svg+xml";
    default:
      return "—";
  }
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

function getTitleBadgeClassName(kind: string) {
  switch (kind) {
    // import kinds
    case "import":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300";
    case "export from":
      return "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300";
    case "dynamic import":
      return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300";
    case "require":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300";
    // symbol kinds
    case "component":
      return "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-300";
    case "function":
      return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300";
    case "class":
      return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300";
    case "interface":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300";
    case "type alias":
    case "type_alias":
      return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
    case "enum":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300";
    case "variable":
    case "constant":
      return "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400";
    default:
      return "";
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

function formatPlural(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function isInternalImport(item: ProjectFileImportEdge) {
  return (
    (item.resolutionKind === "relative_path" ||
      item.resolutionKind === "tsconfig_alias") &&
    Boolean(item.targetPathText)
  );
}

function hasLinkedExportDeclaration(item: ProjectFileExport) {
  return Boolean(
    item.symbolId &&
      item.symbolStartLine &&
      item.symbolStartCol &&
      item.symbolEndLine &&
      item.symbolEndCol,
  );
}

function ClickHintIcon() {
  return <ArrowUpRight className="size-3.5 text-muted-foreground" />;
}

function getNpmPackageName(moduleSpecifier: string) {
  if (!moduleSpecifier) {
    return null;
  }

  if (moduleSpecifier.startsWith("@")) {
    const [scope, name] = moduleSpecifier.split("/");

    if (!scope || !name) {
      return moduleSpecifier;
    }

    return `${scope}/${name}`;
  }

  const [name] = moduleSpecifier.split("/");
  return name || null;
}

interface RelationshipListItem {
  id: string;
  title: string;
  titleBadge: string;
  resolutionLabel?: string;
  resolutionClassName?: string;
  targetLabel?: string;
  targetValue?: string | null;
  location: string;
  detailLabel?: string;
  detailValue?: string | null;
  canNavigate?: boolean;
  onNavigate?: () => void;
  actionIcon?: ReactNode;
  actionHref?: string | null;
  actionLabel?: string;
}

function ClickableCard({
  children,
  onClick,
  disabled = false,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  if (disabled || !onClick) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border/70 bg-background/70 p-3 transition-colors hover:bg-accent/20",
          className,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border border-border/70 bg-background/70 p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

function RelationshipList({
  items,
}: {
  items: RelationshipListItem[];
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <ClickableCard
          key={item.id}
          onClick={item.canNavigate ? item.onNavigate : undefined}
          disabled={!item.canNavigate}
        >
          <div className="flex flex-wrap items-center gap-2">
            <GitBranch className="size-4 text-muted-foreground" />
            <p className="break-all font-medium text-foreground">{item.title}</p>
            <Badge
              variant="outline"
              className={cn(
                "capitalize border font-medium shadow-sm",
                getTitleBadgeClassName(item.titleBadge) || "border-border bg-muted text-foreground",
              )}
            >
              {item.titleBadge}
            </Badge>
            {item.resolutionLabel ? (
              <Badge
                variant="outline"
                className={cn(
                  "border font-semibold shadow-sm",
                  item.resolutionClassName,
                )}
              >
                {item.resolutionLabel}
              </Badge>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {item.actionHref ? (
                <a
                  href={item.actionHref}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  aria-label={item.actionLabel}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.actionIcon}
                </a>
              ) : item.actionIcon ? (
                <span
                  aria-hidden="true"
                  className="inline-flex size-7 items-center justify-center text-muted-foreground"
                >
                  {item.actionIcon}
                </span>
              ) : null}
              {item.canNavigate ? <ClickHintIcon /> : null}
            </div>
          </div>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            {item.targetLabel && item.targetValue ? (
              <p>
                {item.targetLabel}: {item.targetValue}
              </p>
            ) : null}
            {item.detailLabel && item.detailValue ? (
              <p>
                {item.detailLabel}: {item.detailValue}
              </p>
            ) : null}
            <p>Location: {item.location}</p>
          </div>
        </ClickableCard>
      ))}
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

function RelationshipLoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border border-border/70 bg-background/70 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function DetailPanel({
  projectId,
  file,
  fileContent,
  parseData,
  analysisSummary,
  parseDataLoading = false,
  analysisLoading = false,
  activeTab,
  onActiveTabChange,
  openRelationshipSections,
  onOpenRelationshipSectionsChange,
  onNavigateToSymbol,
  onNavigateToImport,
  onNavigateToIncomingImport,
  onNavigateToExport,
  onNavigateToFile,
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
  const detailLanguage =
    parseData?.file.language || fileContent?.language || file.language || "Unknown language";
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
  const relationshipTabValue =
    activeTab === "analysis" ? "analysis" : activeTab === "details" ? "details" : "relationships";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
            <FileCode2 className="h-5 w-5 text-sidebar-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {fileExtension} • {detailLanguage}{" "}
              •{" "}
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

      <Tabs
        value={relationshipTabValue}
        onValueChange={onActiveTabChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-border/70 px-4 py-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="relationships">Relationships</TabsTrigger>
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
                      Blast radius is unavailable until semantic analysis indexes this file.
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
                                  {item.language ?? "Unknown language"} · depth {item.depth}
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
            </div>
          </TabsContent>

          <TabsContent value="relationships" className="mt-0">
            <Accordion
              type="multiple"
              value={openRelationshipSections}
              onValueChange={onOpenRelationshipSectionsChange}
              className="space-y-3"
            >
              <AccordionItem
                value="imports"
                className="rounded-lg border border-border/70 bg-background/70 px-4"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="font-medium text-foreground">Imports</span>
                    <Badge variant="secondary">
                      {parseData?.imports.length ?? 0}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {file.type !== "file" ? (
                    <EmptyTabState
                      title="Imports are file-specific"
                      description="Select a file to inspect its resolved and unresolved imports."
                    />
                  ) : parseDataLoading ? (
                    <RelationshipLoadingSkeleton />
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
                    <RelationshipList
                      items={parseData.imports.map((item) => ({
                        id: item.id,
                        title: item.moduleSpecifier,
                        titleBadge: item.importKind.replace(/_/g, " "),
                        resolutionLabel: getResolutionKindLabel(
                          item.resolutionKind,
                        ),
                        resolutionClassName: getResolutionKindBadgeClassName(
                          item.resolutionKind,
                        ),
                        targetLabel: "Target",
                        targetValue:
                          item.targetPathText ??
                          item.targetExternalSymbolKey ??
                          "Unknown target",
                        detailLabel: "Resolution",
                        detailValue: getResolutionKindLabel(item.resolutionKind),
                        location: `L${item.startLine}:${item.startCol}`,
                        canNavigate: isInternalImport(item),
                        onNavigate: () => onNavigateToImport(item),
                        actionIcon: isInternalImport(item) ? (
                          <ArrowRight className="size-4" />
                        ) : item.resolutionKind === "package" ? (
                          <ExternalLink className="size-4" />
                        ) : undefined,
                        actionHref:
                          item.resolutionKind === "package" &&
                          getNpmPackageName(item.moduleSpecifier)
                            ? `https://www.npmjs.com/package/${getNpmPackageName(item.moduleSpecifier)}`
                            : null,
                        actionLabel:
                          item.resolutionKind === "package"
                            ? "Open package on npm"
                            : undefined,
                      }))}
                    />
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="imported-by"
                className="rounded-lg border border-border/70 bg-background/70 px-4"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="font-medium text-foreground">
                      Imported by
                    </span>
                    <Badge variant="secondary">
                      {parseData?.importedBy.length ?? 0}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {file.type !== "file" ? (
                    <EmptyTabState
                      title="Incoming imports are file-specific"
                      description="Select a file to inspect which other internal files depend on it."
                    />
                  ) : parseDataLoading ? (
                    <RelationshipLoadingSkeleton />
                  ) : !parseData ? (
                    <EmptyTabState
                      title="No parse data yet"
                      description="Semantic analysis has not produced incoming dependency information for this file yet."
                    />
                  ) : parseData.importedBy.length === 0 ? (
                    <EmptyTabState
                      title="No internal files import this file yet"
                      description="The current semantic index does not show any internal repo files depending on this file."
                    />
                  ) : (
                    <RelationshipList
                      items={parseData.importedBy.map((item) => ({
                        id: item.id,
                        title: item.sourceFilePath,
                        titleBadge: item.importKind.replace(/_/g, " "),
                        resolutionLabel: getResolutionKindLabel(
                          item.resolutionKind,
                        ),
                        resolutionClassName: getResolutionKindBadgeClassName(
                          item.resolutionKind,
                        ),
                        openLabel: "Open source file",
                        openPath: item.sourceFilePath,
                        targetLabel: "Module specifier",
                        targetValue: item.moduleSpecifier,
                        detailLabel: "Imported from",
                        detailValue: item.sourceFilePath,
                        location: `L${item.startLine}:${item.startCol}`,
                        canNavigate: true,
                        onNavigate: () => onNavigateToIncomingImport(item),
                      }))}
                    />
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="defines"
                className="rounded-lg border border-border/70 bg-background/70 px-4"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="font-medium text-foreground">
                      Defines symbols
                    </span>
                    <Badge variant="secondary">
                      {parseData?.symbols.length ?? 0}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {file.type !== "file" ? (
                    <EmptyTabState
                      title="Outline is available for files"
                      description="Select a source file to inspect symbols and jump within the viewer."
                    />
                  ) : parseDataLoading ? (
                    <RelationshipLoadingSkeleton />
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
                          onClick={() => onNavigateToSymbol(symbol)}
                          className="flex w-full items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/70 p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-foreground">
                                {symbol.displayName}
                              </span>
                              <Badge
                                variant="secondary"
                                className="capitalize"
                              >
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
                          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                            {symbol.startLine
                              ? `L${symbol.startLine}`
                              : "No range"}
                            <ClickHintIcon />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="exports"
                className="rounded-lg border border-border/70 bg-background/70 px-4"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="font-medium text-foreground">Exports</span>
                    <Badge variant="secondary">
                      {parseData?.exports.length ?? 0}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {file.type !== "file" ? (
                    <EmptyTabState
                      title="Exports are file-specific"
                      description="Select a file to inspect its export surface."
                    />
                  ) : parseDataLoading ? (
                    <RelationshipLoadingSkeleton />
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
                        <ClickableCard
                          key={item.id}
                          onClick={() => onNavigateToExport(item)}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Binary className="size-4 text-muted-foreground" />
                            <p className="font-medium text-foreground">
                              {item.exportName}
                            </p>
                            <Badge variant="secondary" className="capitalize">
                              {item.exportKind.replace(/_/g, " ")}
                            </Badge>
                            <Badge variant="outline">
                              {hasLinkedExportDeclaration(item)
                                ? "Declaration linked"
                                : "Export line only"}
                            </Badge>
                            <ClickHintIcon />
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            <p>Symbol: {item.symbolDisplayName ?? "Not linked"}</p>
                            <p>
                              Source module:{" "}
                              {item.sourceModuleSpecifier ?? "Local export"}
                            </p>
                            {hasLinkedExportDeclaration(item) ? (
                              <p className="text-foreground">Jump: declaration</p>
                            ) : (
                              <p>Jump: export statement</p>
                            )}
                            <p>
                              Location: L{item.startLine}:{item.startCol}
                            </p>
                          </div>
                        </ClickableCard>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

            </Accordion>
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
                        <ClickableCard
                          key={item.path}
                          onClick={() =>
                            onNavigateToFile(item.path, "details")
                          }
                          className="space-y-1"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="truncate font-mono text-xs text-foreground">
                              {item.path}
                            </p>
                            <ClickHintIcon />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Outgoing {item.outgoingCount} • Incoming {item.incomingCount}
                          </p>
                        </ClickableCard>
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
