"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  FunctionSquare,
  Home,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import type {
  ProjectMapGraphResponse,
  ProjectSymbolGraphResponse,
} from "@/features/projects/api";
import { browserProjectsApi } from "@/features/projects/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { GraphNodeDrawer } from "./components/graph-node-drawer";
import { ProjectMapGraphCanvasShell } from "./project-map-graph-canvas-shell";
import { ProjectMapGraphSidebar } from "./project-map-graph-sidebar";
import { useProjectMapGraphLayout } from "./hooks/use-project-map-graph-layout";
import { useProjectMapGraphState } from "./hooks/use-project-map-graph-state";
import { getFolderBreadcrumb } from "./project-map-graph-shared";

const SymbolGraphCanvas = dynamic(
  () =>
    import("./components/symbol-graph-canvas").then((m) => ({
      default: m.SymbolGraphCanvas,
    })),
  { ssr: false },
);

interface ProjectMapGraphViewProps {
  projectId: string;
  graphData: ProjectMapGraphResponse;
  initialFocusFile?: string | null;
  initialFocusSymbol?: string | null;
}

// ─── Symbol Graph Sidebar ─────────────────────────────────────────────────────

function SymbolGraphSidebar({
  projectId,
  filePath,
  symbolName,
  graph,
  isLoading,
  onBack,
  onCopyPath,
}: {
  projectId: string;
  filePath: string;
  symbolName: string;
  graph: ProjectSymbolGraphResponse | null | undefined;
  isLoading: boolean;
  onBack: () => void;
  onCopyPath: (text: string) => void;
}) {
  const target = graph?.target;
  const fileName = filePath.split("/").pop() ?? filePath;
  const dirPath = filePath.includes("/")
    ? filePath.slice(0, filePath.lastIndexOf("/"))
    : null;

  const incomingNodes = graph?.nodes.filter((n) => n.role === "incoming") ?? [];
  const outgoingNodes = graph?.nodes.filter((n) => n.role === "outgoing") ?? [];

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-lg border border-border/70 bg-card p-4">
      {/* Navigation */}
      <Button
        variant="outline"
        size="sm"
        className="justify-start gap-2"
        onClick={onBack}
      >
        <ArrowLeft className="size-4" />
        Back to file graph
      </Button>
      <Button variant="ghost" size="sm" className="justify-start gap-2" asChild>
        <Link href={`/projects/${projectId}/graph`}>
          <Home className="size-4" />
          Back to overview
        </Link>
      </Button>

      <Separator />

      {/* Symbol identity */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Symbol
        </p>
        <div className="flex items-center gap-2">
          <FunctionSquare className="size-4 shrink-0 text-primary" />
          <p className="break-all font-mono text-sm font-semibold text-foreground">
            {symbolName}
          </p>
        </div>
        {target ? (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-xs">
              {target.kind.replace(/_/g, " ")}
            </Badge>
            {target.isExported ? (
              <Badge variant="outline" className="text-xs">
                exported
              </Badge>
            ) : null}
          </div>
        ) : null}
        {target?.signature ? (
          <pre className="overflow-hidden truncate rounded-md bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">
            {target.signature}
          </pre>
        ) : null}
      </div>

      {/* Source file */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Defined in
        </p>
        <p className="break-all font-mono text-xs font-medium text-foreground">
          {fileName}
        </p>
        {dirPath ? (
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {dirPath}
          </p>
        ) : null}
        <div className="flex gap-1.5 pt-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => onCopyPath(filePath)}
          >
            <Copy className="size-3" />
            Copy path
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            asChild
          >
            <Link
              href={`/projects/${projectId}/explorer?path=${encodeURIComponent(filePath)}`}
              target="_blank"
            >
              <ExternalLink className="size-3" />
              Open
            </Link>
          </Button>
        </div>
      </div>

      <Separator />

      {/* Stats */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading graph...
        </div>
      ) : (
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Callers / importers</span>
            <span className="font-mono text-foreground">{incomingNodes.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Outgoing calls</span>
            <span className="font-mono text-foreground">{outgoingNodes.length}</span>
          </div>
          {target ? (
            <>
              <div className="flex justify-between">
                <span>Usage count</span>
                <span className="font-mono text-foreground">{target.usageCount}</span>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Legend */}
      <Separator />
      <div className="space-y-1.5 text-[10px] text-muted-foreground">
        <p className="font-semibold uppercase tracking-wide">Legend</p>
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-orange-400/60 border border-orange-400/80 shrink-0" />
          <span>Symbol callers (relationship)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-purple-400/60 border border-purple-400/80 shrink-0" />
          <span>File importers (import edge)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-primary/60 border border-primary/80 shrink-0" />
          <span>Selected symbol (target)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-sky-400/60 border border-sky-400/80 shrink-0" />
          <span>Outgoing dependencies</span>
        </div>
      </div>
    </aside>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function ProjectMapGraphView({
  projectId,
  graphData,
  initialFocusFile,
  initialFocusSymbol,
}: ProjectMapGraphViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeFile = searchParams.get("file") ?? initialFocusFile ?? null;
  const activeSymbol = searchParams.get("symbol") ?? initialFocusSymbol ?? null;
  const showSymbolGraph = Boolean(activeFile && activeSymbol);

  const { state, derived, actions } = useProjectMapGraphState({
    graphData,
    initialFocusFile: activeFile,
  });
  const { structureLayout, focusLayout, activeLayout, isLayouting } =
    useProjectMapGraphLayout({
      graphData,
      mode: state.mode,
      selectedFolder: state.selectedFolder,
      focusedNodeId: state.focusedNodeId,
      relationMode: state.relationMode,
      expandedClusters: state.expandedClusters,
    });

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
  }, []);

  const breadcrumb = useMemo(
    () => getFolderBreadcrumb(state.selectedFolder),
    [state.selectedFolder],
  );

  function handleExitSymbolGraph() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("file");
    params.delete("symbol");
    const qs = params.toString();
    router.replace(`/projects/${projectId}/graph${qs ? `?${qs}` : ""}`);
  }

  const { data: symbolGraph, isLoading: isSymbolGraphLoading } = useSWR(
    showSymbolGraph && activeFile && activeSymbol
      ? ["project-symbol-graph", projectId, activeFile, activeSymbol]
      : null,
    ([, pid, file, symbol]: [string, string, string, string]) =>
      browserProjectsApi.getProjectSymbolGraph(pid, { file, symbol }),
    { revalidateOnFocus: false, revalidateIfStale: false },
  );

  return (
    <>
      <div className="flex gap-4" style={{ height: "calc(100vh - 280px)" }}>
        {showSymbolGraph && activeFile && activeSymbol ? (
          <SymbolGraphSidebar
            projectId={projectId}
            filePath={activeFile}
            symbolName={activeSymbol}
            graph={symbolGraph}
            isLoading={isSymbolGraphLoading}
            onBack={handleExitSymbolGraph}
            onCopyPath={handleCopyPath}
          />
        ) : (
          <ProjectMapGraphSidebar
            projectId={projectId}
            mode={state.mode}
            graphData={graphData}
            breadcrumb={breadcrumb}
            structureLayout={structureLayout}
            focusLayout={focusLayout}
            selectedFolder={state.selectedFolder}
            focusedNode={derived.focusedNode}
            selectedNode={derived.selectedNode}
            selectedBlastRadius={derived.selectedBlastRadius}
            selectedNodeCycles={derived.selectedNodeCycles}
            allCycleNodeIds={derived.allCycleNodeIds}
            relationMode={state.relationMode}
            onBackOneLevel={actions.backOneLevel}
            onBackToOverview={actions.backToOverview}
            onBackToStructure={actions.backToStructure}
            onRelationModeChange={actions.handleRelationModeChange}
            onFocusSelectedNode={actions.handleFocusSelectedNode}
            onOpenDrawer={actions.handleOpenDrawer}
            onCopyPath={handleCopyPath}
          />
        )}

        {showSymbolGraph && activeFile && activeSymbol ? (
          isSymbolGraphLoading ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-border/70 bg-card">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading symbol graph...
              </div>
            </div>
          ) : (
            <SymbolGraphCanvas
              projectId={projectId}
              filePath={activeFile}
              graph={symbolGraph}
            />
          )
        ) : (
          <ProjectMapGraphCanvasShell
            mode={state.mode}
            graphData={graphData}
            activeLayout={activeLayout}
            activeCycleNodeIds={derived.activeCycleNodeIds}
            selectedNodeId={state.selectedNodeId}
            highlightedNodeIds={derived.highlightedNodeIds}
            relationMode={state.relationMode}
            projectId={projectId}
            isLayouting={isLayouting}
            onNodeClick={actions.handleNodeClick}
            onNodeDoubleClick={actions.handleNodeDoubleClick}
            onOpenDrawer={actions.handleOpenDrawer}
            onCopyPath={handleCopyPath}
            onExpandCluster={actions.handleExpandCluster}
          />
        )}
      </div>

      <GraphNodeDrawer
        projectId={projectId}
        node={derived.drawerNode}
        isInCycle={
          state.drawerNodeId
            ? derived.allCycleNodeIds.has(state.drawerNodeId)
            : false
        }
        cycles={derived.drawerCycles}
        graphNodes={graphData.nodes}
        graphEdges={graphData.edges}
        onClose={actions.handleCloseDrawer}
        onSelectByPath={(path) => {
          actions.handleCloseDrawer();
          if (showSymbolGraph) {
            // Exit symbol mode and focus the selected file in the file graph
            const params = new URLSearchParams(searchParams.toString());
            params.delete("file");
            params.delete("symbol");
            router.replace(`/projects/${projectId}/graph${params.toString() ? `?${params.toString()}` : ""}`);
            actions.handleSelectByPath(path);
          } else {
            actions.handleSelectByPath(path);
          }
        }}
      />
    </>
  );
}
