"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  ExternalLink,
  FileCode2,
  FolderTree,
  GitBranch,
  Home,
  Loader2,
  Search,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type {
  ProjectMapGraphNode,
  ProjectMapGraphResponse,
} from "@/features/projects/api";
import {
  buildFileFocusGraphLayout,
  buildFolderGraphLayout,
  buildFolderStructureLayout,
  type FolderGraphLayoutResult,
  type FolderStructureLayoutResult,
  type GraphLayoutResult,
  type GraphRelationMode,
} from "./utils/graph-layout";
import { GraphNodeDrawer } from "./components/graph-node-drawer";

const GraphCanvas = dynamic(
  () =>
    import("./components/graph-canvas").then((m) => ({
      default: m.GraphCanvas,
    })),
  { ssr: false },
);

interface ProjectMapGraphViewProps {
  projectId: string;
  graphData: ProjectMapGraphResponse;
}

type GraphMode = "overview" | "structure" | "focus";

const RELATION_MODE_LABEL: Record<GraphRelationMode, string> = {
  all: "All direct",
  incoming: "Incoming",
  outgoing: "Outgoing",
  cycles: "Cycles",
  "blast-radius": "Blast radius",
};

const RELATION_MODE_ICON: Record<GraphRelationMode, ReactNode> = {
  all: <GitBranch className="size-3.5" />,
  incoming: <ArrowDown className="size-3.5" />,
  outgoing: <ArrowUp className="size-3.5" />,
  cycles: <Search className="size-3.5" />,
  "blast-radius": <Zap className="size-3.5" />,
};

function getBlastRadiusSummary(
  graphData: ProjectMapGraphResponse,
  nodeId: string | null,
) {
  if (!nodeId) {
    return null;
  }

  const reverseEdgesByTarget = new Map<
    string,
    ProjectMapGraphResponse["edges"]
  >();

  for (const edge of graphData.edges) {
    const items = reverseEdgesByTarget.get(edge.target) ?? [];
    items.push(edge);
    reverseEdgesByTarget.set(edge.target, items);
  }

  const visited = new Set<string>([nodeId]);
  const impactedIds = new Set<string>();
  const queue: Array<{ nodeId: string; depth: number }> = [
    { nodeId, depth: 0 },
  ];
  let directCount = 0;
  let maxDepth = 0;
  let hasCycles = false;

  while (queue.length > 0) {
    const currentItem = queue.shift();

    if (!currentItem) {
      continue;
    }

    for (const edge of reverseEdgesByTarget.get(currentItem.nodeId) ?? []) {
      if (visited.has(edge.source)) {
        hasCycles = true;
        continue;
      }

      const nextDepth = currentItem.depth + 1;
      visited.add(edge.source);
      impactedIds.add(edge.source);
      directCount += nextDepth === 1 ? 1 : 0;
      maxDepth = Math.max(maxDepth, nextDepth);
      queue.push({ nodeId: edge.source, depth: nextDepth });
    }
  }

  return {
    impactedIds,
    totalCount: impactedIds.size,
    directCount,
    maxDepth,
    hasCycles,
  };
}

function getParentFolder(folderPath: string | null): string | null {
  if (!folderPath || folderPath === "(root)") {
    return null;
  }

  const segments = folderPath.split("/");

  if (segments.length <= 1) {
    return null;
  }

  return segments.slice(0, -1).join("/");
}

function getFolderBreadcrumb(folderPath: string | null): string[] {
  if (!folderPath || folderPath === "(root)") {
    return ["Project"];
  }

  return ["Project", ...folderPath.split("/")];
}

export function ProjectMapGraphView({
  projectId,
  graphData,
}: ProjectMapGraphViewProps) {
  const [mode, setMode] = useState<GraphMode>("overview");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [relationMode, setRelationMode] = useState<GraphRelationMode>("all");
  const [drawerNodeId, setDrawerNodeId] = useState<string | null>(null);
  const [folderLayout, setFolderLayout] =
    useState<FolderGraphLayoutResult | null>(null);
  const [structureLayout, setStructureLayout] =
    useState<FolderStructureLayoutResult | null>(null);
  const [focusLayout, setFocusLayout] = useState<GraphLayoutResult | null>(
    null,
  );
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(
    () => new Set(),
  );
  const [isLayouting, setIsLayouting] = useState(false);
  const layoutRunRef = useRef(0);
  useEffect(() => {
    const run = ++layoutRunRef.current;
    setIsLayouting(true);

    if (mode === "overview") {
      buildFolderGraphLayout(graphData).then((result) => {
        if (run !== layoutRunRef.current) return;
        setFolderLayout(result);
        setStructureLayout(null);
        setFocusLayout(null);
        setIsLayouting(false);
      });
      return;
    }

    if (mode === "structure" && selectedFolder) {
      buildFolderStructureLayout(graphData, selectedFolder).then((result) => {
        if (run !== layoutRunRef.current) return;
        setStructureLayout(result);
        setFolderLayout(null);
        setFocusLayout(null);
        setIsLayouting(false);
      });
      return;
    }

    if (mode === "focus" && focusedNodeId) {
      buildFileFocusGraphLayout(
        graphData,
        focusedNodeId,
        relationMode,
        expandedClusters,
      ).then((result) => {
        if (run !== layoutRunRef.current) return;
        setFocusLayout(result);
        setFolderLayout(null);
        setStructureLayout(null);
        setIsLayouting(false);
      });
      return;
    }

    setIsLayouting(false);
  }, [
    expandedClusters,
    focusedNodeId,
    graphData,
    mode,
    relationMode,
    selectedFolder,
  ]);

  const allCycleNodeIds = useMemo(
    () => new Set(graphData.cycles.flatMap((cycle) => cycle.nodeIds)),
    [graphData.cycles],
  );

  const drawerNode: ProjectMapGraphNode | null = useMemo(() => {
    if (!drawerNodeId) return null;
    return graphData.nodes.find((node) => node.id === drawerNodeId) ?? null;
  }, [drawerNodeId, graphData.nodes]);
  const drawerCycles = useMemo(() => {
    if (!drawerNodeId) return [];
    return graphData.cycles.filter((cycle) =>
      cycle.nodeIds.includes(drawerNodeId),
    );
  }, [drawerNodeId, graphData.cycles]);

  const focusedNode = useMemo(() => {
    if (!focusedNodeId) return null;
    return graphData.nodes.find((node) => node.id === focusedNodeId) ?? null;
  }, [focusedNodeId, graphData.nodes]);
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return graphData.nodes.find((node) => node.id === selectedNodeId) ?? null;
  }, [selectedNodeId, graphData.nodes]);
  const selectedBlastRadius = useMemo(
    () => getBlastRadiusSummary(graphData, selectedNodeId),
    [graphData, selectedNodeId],
  );
  const highlightedNodeIds = useMemo(() => {
    if (!selectedNodeId) return undefined;

    const relatedIds = new Set<string>([selectedNodeId]);
    const blastRadiusSummary = getBlastRadiusSummary(graphData, selectedNodeId);
    const selectedCycleIds = new Set(
      graphData.cycles
        .filter((cycle) => cycle.nodeIds.includes(selectedNodeId))
        .flatMap((cycle) => cycle.nodeIds),
    );

    if (relationMode === "cycles") {
      for (const nodeId of selectedCycleIds) {
        relatedIds.add(nodeId);
      }

      return relatedIds;
    }

    if (relationMode === "blast-radius") {
      for (const nodeId of blastRadiusSummary?.impactedIds ?? []) {
        relatedIds.add(nodeId);
      }

      return relatedIds;
    }

    for (const edge of graphData.edges) {
      if (
        (relationMode === "all" || relationMode === "outgoing") &&
        edge.source === selectedNodeId
      ) {
        relatedIds.add(edge.target);
      }

      if (
        (relationMode === "all" || relationMode === "incoming") &&
        edge.target === selectedNodeId
      ) {
        relatedIds.add(edge.source);
      }
    }

    return relatedIds;
  }, [graphData, relationMode, selectedNodeId]);

  const enterStructure = (folder: string) => {
    setMode("structure");
    setSelectedFolder(folder);
    setFocusedNodeId(null);
    setSelectedNodeId(null);
    setRelationMode("all");
    setDrawerNodeId(null);
    setExpandedClusters(new Set());
  };

  const enterFocus = (nodeId: string, nextRelationMode = relationMode) => {
    setMode("focus");
    setFocusedNodeId(nodeId);
    setSelectedNodeId(nodeId);
    setRelationMode(nextRelationMode);
    setDrawerNodeId(null);
    setExpandedClusters(new Set());
  };

  const backToOverview = () => {
    setMode("overview");
    setSelectedFolder(null);
    setFocusedNodeId(null);
    setSelectedNodeId(null);
    setRelationMode("all");
    setDrawerNodeId(null);
    setExpandedClusters(new Set());
  };

  const backOneLevel = () => {
    const parentFolder = getParentFolder(selectedFolder);

    if (!parentFolder) {
      backToOverview();
      return;
    }

    enterStructure(parentFolder);
  };

  const backToStructure = () => {
    if (focusedNode?.dirPath) {
      enterStructure(focusedNode.dirPath);
      return;
    }

    backToOverview();
  };

  const handleNodeClick = (nodeId: string) => {
    if (nodeId === "") {
      setSelectedNodeId(null);
      return;
    }

    if (mode === "overview") {
      const folderNode = graphData.folderNodes.find(
        (node) => node.id === nodeId,
      );

      if (folderNode) {
        enterStructure(folderNode.folder);
      }

      return;
    }

    if (mode === "structure") {
      if (nodeId.startsWith("structure-folder:")) {
        enterStructure(nodeId.replace("structure-folder:", ""));
        return;
      }

      if (graphData.nodes.some((node) => node.id === nodeId)) {
        setSelectedNodeId((previousNodeId) =>
          previousNodeId === nodeId ? null : nodeId,
        );
      }

      return;
    }

    if (
      mode === "focus" &&
      graphData.nodes.some((node) => node.id === nodeId)
    ) {
      setSelectedNodeId((previousNodeId) =>
        previousNodeId === nodeId ? null : nodeId,
      );
    }
  };

  const handleNodeDoubleClick = (nodeId: string) => {
    if (graphData.nodes.some((node) => node.id === nodeId)) {
      enterFocus(nodeId, "all");
    }
  };

  const handleOpenDrawer = useCallback((nodeId: string) => {
    setDrawerNodeId(nodeId);
  }, []);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
  }, []);

  const handleExpandCluster = useCallback((clusterId: string) => {
    setExpandedClusters((previous) => {
      if (previous.has(clusterId)) return previous;
      const next = new Set(previous);
      next.add(clusterId);
      return next;
    });
  }, []);

  const handleSelectByPath = (path: string) => {
    const node = graphData.nodes.find((item) => item.path === path);

    if (node) {
      setMode("focus");
      setFocusedNodeId(node.id);
      setRelationMode("all");
      setDrawerNodeId(node.id);
      setSelectedNodeId(node.id);
      setExpandedClusters(new Set());
    }
  };

  const handleFocusSelectedNode = (
    nextRelationMode: GraphRelationMode = relationMode,
  ) => {
    if (!selectedNodeId) return;
    enterFocus(selectedNodeId, nextRelationMode);
  };

  const handleRelationModeChange = (nextRelationMode: GraphRelationMode) => {
    setRelationMode(nextRelationMode);
    setExpandedClusters(new Set());

    if (selectedNodeId) {
      enterFocus(selectedNodeId, nextRelationMode);
    }
  };

  const activeLayout =
    mode === "overview"
      ? folderLayout
      : mode === "structure"
        ? structureLayout
        : focusLayout;
  const activeCycleNodeIds =
    mode === "overview" ? new Set<string>() : allCycleNodeIds;
  const breadcrumb = getFolderBreadcrumb(selectedFolder);
  const selectedNodeCycles = selectedNodeId
    ? graphData.cycles.filter((cycle) => cycle.nodeIds.includes(selectedNodeId))
    : [];

  return (
    <>
      <div className="flex gap-4" style={{ height: "calc(100vh - 280px)" }}>
        <aside className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-border/70 bg-card p-4">
          {mode === "overview" ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Folder overview
              </p>
              <p className="text-sm text-muted-foreground">
                Start from top-level folders, then drill into the structure one
                level at a time.
              </p>
              <Separator />
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Folders</span>
                  <span className="font-mono">
                    {graphData.stats.folderCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Cross-folder edges</span>
                  <span className="font-mono">
                    {graphData.stats.folderEdgeCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Files</span>
                  <span className="font-mono">{graphData.stats.nodeCount}</span>
                </div>
              </div>
            </>
          ) : mode === "structure" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="justify-start gap-2"
                onClick={backOneLevel}
              >
                <ArrowLeft className="size-4" />
                Back one level
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start gap-2"
                onClick={backToOverview}
              >
                <Home className="size-4" />
                Back to overview
              </Button>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Structure drilldown
                </p>
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {breadcrumb.map((segment, index) => (
                    <span
                      key={`${segment}-${index}`}
                      className="flex items-center gap-1"
                    >
                      {index > 0 ? <span>/</span> : null}
                      <span
                        className={
                          index === breadcrumb.length - 1
                            ? "font-mono font-semibold text-foreground"
                            : "font-mono"
                        }
                      >
                        {segment}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              <Separator />
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Child folders</span>
                  <span className="font-mono">
                    {structureLayout?.childFolderCount ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Direct files</span>
                  <span className="font-mono">
                    {structureLayout?.directFileCount ?? 0}
                  </span>
                </div>
              </div>

              {structureLayout?.hiddenDirectFileCount ? (
                <div className="rounded-lg border border-border/70 bg-background/70 p-3 text-xs text-muted-foreground">
                  Showing the most connected direct files first.{" "}
                  <span className="font-medium text-foreground">
                    {structureLayout.hiddenDirectFileCount}
                  </span>{" "}
                  quieter files are hidden in this level.
                </div>
              ) : null}
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="justify-start gap-2"
                onClick={backToStructure}
              >
                <ArrowLeft className="size-4" />
                Back to structure
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start gap-2"
                onClick={backToOverview}
              >
                <Home className="size-4" />
                Back to overview
              </Button>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  File focus
                </p>
                <p className="break-all font-mono text-sm text-foreground">
                  {focusedNode?.path ?? "Selected file"}
                </p>
              </div>

              <Separator />
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Incoming</span>
                  <span className="font-mono">
                    {focusedNode?.incomingCount ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Outgoing</span>
                  <span className="font-mono">
                    {focusedNode?.outgoingCount ?? 0}
                  </span>
                </div>
              </div>

              {focusLayout?.smartDefault ? (
                <div className="rounded-lg border border-border/70 bg-background/70 p-3 text-xs text-muted-foreground">
                  Showing{" "}
                  <span className="font-medium text-foreground">
                    {focusLayout.smartDefault.shownCount}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-foreground">
                    {focusLayout.smartDefault.totalCount}
                  </span>{" "}
                  {focusLayout.smartDefault.mode === "blast-radius"
                    ? "closest impacted files."
                    : "strongest related files."}
                </div>
              ) : null}
              {relationMode === "cycles" ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  Circular dependency path
                </div>
              ) : null}
              {relationMode === "blast-radius" && selectedBlastRadius ? (
                <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 p-3 text-xs text-fuchsia-200">
                  <p className="font-medium text-fuchsia-100">
                    Blast radius: {selectedBlastRadius.totalCount} impacted
                    files
                  </p>
                  <p className="mt-1 text-fuchsia-100/75">
                    Reverse dependency closure: files that import this file,
                    then files importing those files.
                  </p>
                </div>
              ) : null}
            </>
          )}

          {selectedNode ? (
            <>
              <Separator />
              <div className="space-y-3 rounded-lg border border-border/70 bg-background/70 p-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Selected file
                    </p>
                    {allCycleNodeIds.has(selectedNode.id) ? (
                      <Badge
                        variant="outline"
                        className="border-destructive/40 bg-destructive/10 text-[10px] text-destructive"
                      >
                        Cycle
                      </Badge>
                    ) : null}
                  </div>
                  <p className="break-all font-mono text-xs font-medium text-foreground">
                    {selectedNode.path}
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    {selectedNode.language ? (
                      <span>{selectedNode.language}</span>
                    ) : null}
                    <span>↓ {selectedNode.incomingCount} incoming</span>
                    <span>↑ {selectedNode.outgoingCount} outgoing</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Outgoing arrows point to files this file imports. Incoming
                    arrows point from files importing this file.
                  </p>
                  {selectedBlastRadius ? (
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px] text-muted-foreground">
                      <div className="rounded-md bg-muted/60 px-1.5 py-1">
                        <p className="font-mono font-semibold text-foreground">
                          {selectedBlastRadius.totalCount}
                        </p>
                        <p>impact</p>
                      </div>
                      <div className="rounded-md bg-muted/60 px-1.5 py-1">
                        <p className="font-mono font-semibold text-foreground">
                          {selectedBlastRadius.directCount}
                        </p>
                        <p>direct</p>
                      </div>
                      <div className="rounded-md bg-muted/60 px-1.5 py-1">
                        <p className="font-mono font-semibold text-foreground">
                          {selectedBlastRadius.maxDepth}
                        </p>
                        <p>depth</p>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      "all",
                      "incoming",
                      "outgoing",
                      "cycles",
                      "blast-radius",
                    ] as GraphRelationMode[]
                  ).map((item) => (
                    <Button
                      key={item}
                      type="button"
                      variant={relationMode === item ? "default" : "outline"}
                      size="sm"
                      className="h-8 justify-start gap-1.5 px-2 text-[11px]"
                      onClick={() => handleRelationModeChange(item)}
                    >
                      {RELATION_MODE_ICON[item]}
                      {RELATION_MODE_LABEL[item]}
                    </Button>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 w-full justify-start gap-1.5 px-2 text-xs"
                    onClick={() => handleFocusSelectedNode(relationMode)}
                  >
                    <Search className="size-3.5" />
                    Focus relations
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full justify-start gap-1.5 px-2 text-xs"
                    onClick={() => handleOpenDrawer(selectedNode.id)}
                  >
                    <FileCode2 className="size-3.5" />
                    Details
                  </Button>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 justify-start gap-1.5 px-2 text-xs"
                      onClick={() => handleCopyPath(selectedNode.path)}
                    >
                      <Copy className="size-3.5" />
                      Copy
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 justify-start gap-1.5 px-2 text-xs"
                      asChild
                    >
                      <Link
                        href={`/projects/${projectId}/map?path=${encodeURIComponent(
                          selectedNode.path,
                        )}`}
                        target="_blank"
                      >
                        <ExternalLink className="size-3.5" />
                        Mapping
                      </Link>
                    </Button>
                  </div>
                </div>

                {relationMode === "cycles" &&
                selectedNodeCycles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    This file is not part of a detected cycle.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="mt-auto space-y-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>File nodes</span>
              <span className="font-mono">{graphData.stats.nodeCount}</span>
            </div>
            <div className="flex justify-between">
              <span>File edges</span>
              <span className="font-mono">{graphData.stats.edgeCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Cycles</span>
              <span className="font-mono">{graphData.stats.cycleCount}</span>
            </div>
          </div>
        </aside>

        <div className="relative flex-1 overflow-hidden rounded-lg border border-border/70 bg-card">
          {isLayouting ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Computing layout...
              </p>
            </div>
          ) : activeLayout && activeLayout.nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-medium text-foreground">
                {mode === "overview"
                  ? "No folder graph available"
                  : mode === "structure"
                    ? "No immediate children found"
                    : "No related files found"}
              </p>
              <p className="text-xs text-muted-foreground">
                {mode === "overview"
                  ? "No cross-folder dependencies were indexed yet."
                  : mode === "structure"
                    ? "This folder may only contain files without indexed semantic data."
                    : "This file has no indexed internal dependency edges yet."}
              </p>
            </div>
          ) : activeLayout ? (
            <>
              {mode === "overview" && graphData.stats.folderEdgeCount === 0 ? (
                <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2">
                  <div className="rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
                    No cross-folder dependencies found. Showing folder nodes
                    only.
                  </div>
                </div>
              ) : null}
              {mode === "structure" || mode === "focus" ? (
                <div className="absolute right-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-2 rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
                  {mode === "structure" ? (
                    <span className="flex items-center gap-1.5">
                      <FolderTree className="size-3.5" />
                      External badges = outside this folder
                    </span>
                  ) : null}
                  <span>
                    Direction:{" "}
                    <span className="font-medium text-foreground">
                      importer
                    </span>{" "}
                    →{" "}
                    <span className="font-medium text-foreground">
                      imported
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-5 rounded-full bg-sky-400" />
                    selected imports
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-5 rounded-full border-t-2 border-dashed border-orange-400" />
                    imports selected
                  </span>
                  {relationMode === "blast-radius" ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-0.5 w-5 rounded-full bg-fuchsia-400" />
                      blast radius
                    </span>
                  ) : null}
                </div>
              ) : null}
              <GraphCanvas
                nodes={activeLayout.nodes}
                edges={activeLayout.edges}
                cycleNodeIds={activeCycleNodeIds}
                selectedNodeId={selectedNodeId}
                highlightedNodeIds={highlightedNodeIds}
                activeRelationMode={relationMode}
                projectId={projectId}
                enableFocusLayout={mode !== "structure" || !selectedNodeId}
                onNodeClick={handleNodeClick}
                onNodeDoubleClick={handleNodeDoubleClick}
                onOpenDrawer={handleOpenDrawer}
                onCopyPath={handleCopyPath}
                onExpandCluster={handleExpandCluster}
              />
            </>
          ) : null}
        </div>
      </div>

      <GraphNodeDrawer
        projectId={projectId}
        node={drawerNode}
        isInCycle={drawerNodeId ? allCycleNodeIds.has(drawerNodeId) : false}
        cycles={drawerCycles}
        graphNodes={graphData.nodes}
        graphEdges={graphData.edges}
        onClose={() => setDrawerNodeId(null)}
        onSelectByPath={handleSelectByPath}
      />
    </>
  );
}
