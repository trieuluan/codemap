"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, FileCode2, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { browserProjectsApi } from "@/features/projects/api";
import { resolveMonacoLanguage } from "@/lib/monaco-language";
import type {
  ProjectFileContent,
  ProjectFileParseData,
  ProjectMapGraphCycle,
  ProjectMapGraphEdge,
  ProjectMapGraphNode,
} from "@/features/projects/api";
import { cn } from "@/lib/utils";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function getResolutionLabel(kind: string) {
  switch (kind) {
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
      return kind.replace(/_/g, " ");
  }
}

function getResolutionClassName(kind: string) {
  switch (kind) {
    case "relative_path":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400";
    case "tsconfig_alias":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-400";
    case "package":
      return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400";
    case "builtin":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400";
    case "unresolved":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function buildCycleExplanationSteps(
  cycle: ProjectMapGraphCycle,
  nodes: ProjectMapGraphNode[],
  edges: ProjectMapGraphEdge[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const cycleNodeIds = new Set(cycle.nodeIds);
  const outgoingEdges = new Map<string, ProjectMapGraphEdge[]>();

  for (const edge of edges) {
    if (!cycleNodeIds.has(edge.source) || !cycleNodeIds.has(edge.target)) {
      continue;
    }

    const items = outgoingEdges.get(edge.source) ?? [];
    items.push(edge);
    outgoingEdges.set(edge.source, items);
  }

  if (cycle.kind === "direct" && cycle.nodeIds.length === 2) {
    const [firstId, secondId] = cycle.nodeIds;
    const firstToSecond = outgoingEdges
      .get(firstId)
      ?.find((edge) => edge.target === secondId);
    const secondToFirst = outgoingEdges
      .get(secondId)
      ?.find((edge) => edge.target === firstId);

    if (firstId && secondId && firstToSecond && secondToFirst) {
      return [firstToSecond, secondToFirst].map((edge) => ({
        sourcePath: nodeById.get(edge.source)?.path ?? edge.source,
        targetPath: nodeById.get(edge.target)?.path ?? edge.target,
        importKind: edge.importKind,
        resolutionKind: edge.resolutionKind,
      }));
    }
  }

  const startId = cycle.nodeIds[0];

  if (!startId) {
    return [];
  }

  const visited = new Set<string>([startId]);
  const pathEdges: ProjectMapGraphEdge[] = [];

  function findCyclePath(currentId: string): boolean {
    for (const edge of outgoingEdges.get(currentId) ?? []) {
      if (edge.target === startId && pathEdges.length > 0) {
        pathEdges.push(edge);
        return true;
      }

      if (visited.has(edge.target)) {
        continue;
      }

      visited.add(edge.target);
      pathEdges.push(edge);

      if (findCyclePath(edge.target)) {
        return true;
      }

      pathEdges.pop();
      visited.delete(edge.target);
    }

    return false;
  }

  if (!findCyclePath(startId)) {
    return [];
  }

  return pathEdges.map((edge) => ({
    sourcePath: nodeById.get(edge.source)?.path ?? edge.source,
    targetPath: nodeById.get(edge.target)?.path ?? edge.target,
    importKind: edge.importKind,
    resolutionKind: edge.resolutionKind,
  }));
}

// --- Info tab ---

function InfoTab({
  node,
  fileContent,
  isLoading,
}: {
  node: ProjectMapGraphNode;
  fileContent?: ProjectFileContent;
  isLoading: boolean;
}) {
  const rows: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: "Path",
      value: (
        <span className="break-all font-mono text-xs text-foreground">
          {node.path}
        </span>
      ),
    },
    {
      label: "Language",
      value: node.language ?? "—",
    },
    {
      label: "Imports",
      value: `${node.outgoingCount} outgoing · ${node.incomingCount} incoming`,
    },
    {
      label: "Parseable",
      value: node.isParseable ? "Yes" : "No",
    },
  ];

  if (isLoading) {
    rows.push(
      { label: "Size", value: <Skeleton className="h-4 w-16" /> },
      { label: "Lines", value: <Skeleton className="h-4 w-12" /> },
    );
  } else if (fileContent) {
    if (fileContent.sizeBytes != null) {
      const kb = fileContent.sizeBytes / 1024;
      rows.push({
        label: "Size",
        value: kb < 1 ? `${fileContent.sizeBytes} B` : `${kb.toFixed(1)} KB`,
      });
    }

    if (typeof fileContent.content === "string") {
      rows.push({
        label: "Lines",
        value: String(fileContent.content.split(/\r?\n/).length),
      });
    }

    if (fileContent.mimeType) {
      rows.push({ label: "MIME", value: fileContent.mimeType });
    }
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="space-y-1 p-4">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-start justify-between gap-4 rounded-md px-3 py-2 text-sm odd:bg-muted/30"
          >
            <span className="shrink-0 text-muted-foreground">{row.label}</span>
            <span className="text-right text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Code tab ---

function CodeTab({
  node,
  fileContent,
  isLoading,
}: {
  node: ProjectMapGraphNode;
  fileContent?: ProjectFileContent;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="h-full min-h-0 space-y-2 overflow-y-auto p-4">
        {[...Array(8)].map((_, i) => (
          <Skeleton
            key={i}
            className="h-4"
            style={{ width: `${70 + (i % 3) * 10}%` }}
          />
        ))}
      </div>
    );
  }

  if (!fileContent || typeof fileContent.content !== "string") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <FileCode2 className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {fileContent?.status !== "ready"
            ? "File content is not available"
            : "No content to display"}
        </p>
      </div>
    );
  }
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <MonacoEditor
        height="100%"
        value={fileContent.content}
        language={resolveMonacoLanguage({
          language: node.language,
          extension: fileContent.extension,
          path: node.path,
        })}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "off",
          fontSize: 12,
          folding: true,
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
        }}
      />
    </div>
  );
}

// --- Deps tab ---

function DepsTab({
  parseData,
  isLoading,
  projectId,
  onSelectNode,
}: {
  parseData?: ProjectFileParseData;
  isLoading: boolean;
  projectId: string;
  onSelectNode?: (path: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="h-full min-h-0 space-y-2 overflow-y-auto p-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  const imports = parseData?.imports ?? [];
  const incomingImports = parseData?.importedBy ?? [];

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="space-y-4 p-4">
        {/* Outgoing imports */}
        <section>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <GitBranch className="size-3.5" />
            Imports
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal">
              {imports.length}
            </span>
          </p>
          {imports.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No outgoing imports.
            </p>
          ) : (
            <div className="space-y-1.5">
              {imports.map((item, i) => (
                <button
                  key={`${item.moduleSpecifier}-${i}`}
                  type="button"
                  disabled={!item.targetPathText}
                  onClick={() =>
                    item.targetPathText && onSelectNode?.(item.targetPathText)
                  }
                  className={cn(
                    "w-full rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-left text-xs transition-colors",
                    item.targetPathText
                      ? "hover:bg-accent/50 cursor-pointer"
                      : "cursor-default",
                  )}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-medium text-foreground break-all">
                      {item.moduleSpecifier}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] border font-semibold",
                        getResolutionClassName(item.resolutionKind),
                      )}
                    >
                      {getResolutionLabel(item.resolutionKind)}
                    </Badge>
                  </div>
                  {item.targetPathText && (
                    <p className="mt-0.5 truncate font-mono text-muted-foreground">
                      {item.targetPathText}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Incoming imports */}
        <section>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ArrowRight className="size-3.5" />
            Imported by
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal">
              {incomingImports.length}
            </span>
          </p>
          {incomingImports.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Not imported by any file.
            </p>
          ) : (
            <div className="space-y-1.5">
              {incomingImports.map((item, i) => (
                <button
                  key={`${item.sourceFilePath}-${i}`}
                  type="button"
                  onClick={() => onSelectNode?.(item.sourceFilePath)}
                  className="w-full rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-left text-xs transition-colors hover:bg-accent/50 cursor-pointer"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-medium text-foreground break-all">
                      {item.moduleSpecifier}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] border font-semibold",
                        getResolutionClassName(item.resolutionKind),
                      )}
                    >
                      {getResolutionLabel(item.resolutionKind)}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-muted-foreground">
                    {item.sourceFilePath}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// --- Cycles tab ---

function CyclesTab({
  cycles,
  currentPath,
  nodes,
  edges,
  onSelectNode,
}: {
  cycles: ProjectMapGraphCycle[];
  currentPath: string;
  nodes: ProjectMapGraphNode[];
  edges: ProjectMapGraphEdge[];
  onSelectNode?: (path: string) => void;
}) {
  if (cycles.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <GitBranch className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No cycle found</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          This file is not part of an indexed circular dependency.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive">
            What is a cycle?
          </p>
          <p className="mt-1 text-xs text-destructive/80">
            A cycle means this file depends on another file that eventually
            depends back on it. It is not always a compile error, but it makes
            module loading order and refactoring harder to reason about.
          </p>
        </div>

        {cycles.map((cycle, index) => {
          const steps = buildCycleExplanationSteps(cycle, nodes, edges);

          return (
            <section
              key={`${cycle.kind}-${cycle.paths.join("->")}-${index}`}
              className="rounded-lg border border-border/70 bg-background/70 p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {cycle.kind === "direct"
                      ? "Direct import loop"
                      : "Import loop group"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {cycle.paths.length} files involved
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="border-destructive/40 bg-destructive/10 text-destructive"
                >
                  Cycle
                </Badge>
              </div>

              {steps.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">
                    Why this is a cycle
                  </p>
                  <div className="space-y-1.5">
                    {steps.map((step, stepIndex) => (
                      <div
                        key={`${step.sourcePath}->${step.targetPath}-${stepIndex}`}
                        className="rounded-md border border-border/70 bg-card/70 p-2 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectNode?.(step.sourcePath)}
                          className={cn(
                            "break-all font-mono font-medium text-left hover:underline",
                            step.sourcePath === currentPath
                              ? "text-destructive"
                              : "text-foreground",
                          )}
                        >
                          {step.sourcePath}
                        </button>
                        <div className="my-1 flex flex-wrap items-center gap-1.5 text-muted-foreground">
                          <ArrowRight className="size-3.5" />
                          <span>imports</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "border text-[10px]",
                              getResolutionClassName(step.resolutionKind),
                            )}
                          >
                            {getResolutionLabel(step.resolutionKind)}
                          </Badge>
                          <span>{step.importKind.replace(/_/g, " ")}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onSelectNode?.(step.targetPath)}
                          className={cn(
                            "break-all font-mono font-medium text-left hover:underline",
                            step.targetPath === currentPath
                              ? "text-destructive"
                              : "text-foreground",
                          )}
                        >
                          {step.targetPath}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-border/70 bg-muted/30 p-2 text-xs text-muted-foreground">
                  CodeMap detected these files are mutually connected, but the
                  exact ordered path is not available in this response. The file
                  list below is the detected cycle group.
                </div>
              )}

              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-medium text-foreground">
                  Files in this cycle
                </p>
                {cycle.paths.map((path, pathIndex) => (
                  <button
                    key={`${path}-${pathIndex}`}
                    type="button"
                    onClick={() => onSelectNode?.(path)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/50",
                      path === currentPath
                        ? "bg-destructive/10 text-destructive"
                        : "text-foreground",
                    )}
                  >
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {pathIndex + 1}
                    </span>
                    <span className="break-all font-mono">{path}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// --- Main drawer ---

interface GraphNodeDrawerProps {
  projectId: string;
  node: ProjectMapGraphNode | null;
  isInCycle: boolean;
  cycles: ProjectMapGraphCycle[];
  graphNodes: ProjectMapGraphNode[];
  graphEdges: ProjectMapGraphEdge[];
  onClose: () => void;
  onSelectByPath: (path: string) => void;
}

export function GraphNodeDrawer({
  projectId,
  node,
  isInCycle,
  cycles,
  graphNodes,
  graphEdges,
  onClose,
  onSelectByPath,
}: GraphNodeDrawerProps) {
  const { data: fileContent, isLoading: contentLoading } =
    useSWR<ProjectFileContent>(
      node ? ["graph-drawer-content", projectId, node.path] : null,
      ([, pid, path]: [string, string, string]) =>
        browserProjectsApi.getProjectFileContent(pid, path),
      { revalidateOnFocus: false, revalidateIfStale: false },
    );

  const { data: parseData, isLoading: parseLoading } =
    useSWR<ProjectFileParseData>(
      node ? ["graph-drawer-parse", projectId, node.path] : null,
      ([, pid, path]: [string, string, string]) =>
        browserProjectsApi.getProjectFileParseData(pid, path),
      { revalidateOnFocus: false, revalidateIfStale: false },
    );

  return (
    <Sheet open={!!node} onOpenChange={(open: boolean) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex h-full min-h-0 w-[480px] max-w-[100vw] flex-col gap-0 overflow-hidden p-0 sm:w-[540px] sm:max-w-[540px]"
      >
        {node && (
          <>
            <SheetHeader className="shrink-0 border-b px-5 py-4">
              <SheetTitle className="sr-only">{getFileName(node.path)}</SheetTitle>
              <div className="flex items-start justify-between gap-8">
                <div className="min-w-0 pr-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-semibold text-foreground">
                      {getFileName(node.path)}
                    </p>
                    {node.language && (
                      <Badge variant="secondary" className="text-xs">
                        {node.language}
                      </Badge>
                    )}
                    {isInCycle && (
                      <Badge
                        variant="outline"
                        className="border-destructive/40 bg-destructive/10 text-destructive text-xs"
                      >
                        Cycle
                      </Badge>
                    )}
                  </div>
                  {node.dirPath && (
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground/60">
                      {node.dirPath}
                    </p>
                  )}
                </div>
              </div>
            </SheetHeader>

            <Tabs
              defaultValue="info"
              className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden"
            >
              <TabsList className="mx-5 mt-3 shrink-0 justify-start">
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="code">Code</TabsTrigger>
                <TabsTrigger value="deps">Dependencies</TabsTrigger>
                {isInCycle ? (
                  <TabsTrigger value="cycles">Cycles</TabsTrigger>
                ) : null}
              </TabsList>

              <TabsContent
                value="info"
                className="mt-0 flex min-h-0 flex-1 basis-0 flex-col overflow-hidden data-[state=inactive]:hidden"
              >
                <InfoTab
                  node={node}
                  fileContent={fileContent}
                  isLoading={contentLoading}
                />
              </TabsContent>

              <TabsContent
                value="code"
                className="mt-0 flex min-h-0 flex-1 basis-0 flex-col overflow-hidden data-[state=inactive]:hidden"
              >
                <CodeTab
                  node={node}
                  fileContent={fileContent}
                  isLoading={contentLoading}
                />
              </TabsContent>

              <TabsContent
                value="deps"
                className="mt-0 flex min-h-0 flex-1 basis-0 flex-col overflow-hidden data-[state=inactive]:hidden"
              >
                <DepsTab
                  parseData={parseData}
                  isLoading={parseLoading}
                  projectId={projectId}
                  onSelectNode={onSelectByPath}
                />
              </TabsContent>

              {isInCycle ? (
                <TabsContent
                  value="cycles"
                  className="mt-0 flex min-h-0 flex-1 basis-0 flex-col overflow-hidden data-[state=inactive]:hidden"
                >
                  <CyclesTab
                    cycles={cycles}
                    currentPath={node.path}
                    nodes={graphNodes}
                    edges={graphEdges}
                    onSelectNode={onSelectByPath}
                  />
                </TabsContent>
              ) : null}
            </Tabs>

            <div className="shrink-0 border-t px-5 py-3">
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/projects/${projectId}/map?path=${encodeURIComponent(node.path)}`}
                >
                  Open in Mapping
                  <ArrowRight className="ml-1.5 size-3.5" />
                </Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
