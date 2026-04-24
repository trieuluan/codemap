"use client";

import {
  ArrowLeft,
  Copy,
  ExternalLink,
  FileCode2,
  FolderTree,
  Home,
  Search,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type {
  ProjectMapGraphNode,
  ProjectMapGraphResponse,
} from "@/features/projects/api";
import type {
  FolderStructureLayoutResult,
  GraphLayoutResult,
  GraphRelationMode,
} from "./utils/graph-layout";
import {
  type BlastRadiusSummary,
  type GraphMode,
  RELATION_MODE_ICON,
  RELATION_MODE_LABEL,
} from "./project-map-graph-shared";

interface ProjectMapGraphSidebarProps {
  projectId: string;
  mode: GraphMode;
  graphData: ProjectMapGraphResponse;
  breadcrumb: string[];
  structureLayout: FolderStructureLayoutResult | null;
  focusLayout: GraphLayoutResult | null;
  selectedFolder: string | null;
  focusedNode: ProjectMapGraphNode | null;
  selectedNode: ProjectMapGraphNode | null;
  selectedBlastRadius: BlastRadiusSummary | null;
  selectedNodeCycles: ProjectMapGraphResponse["cycles"];
  allCycleNodeIds: Set<string>;
  relationMode: GraphRelationMode;
  onBackOneLevel: () => void;
  onBackToOverview: () => void;
  onBackToStructure: () => void;
  onRelationModeChange: (mode: GraphRelationMode) => void;
  onFocusSelectedNode: (mode: GraphRelationMode) => void;
  onOpenDrawer: (nodeId: string) => void;
  onCopyPath: (path: string) => void;
}

export function ProjectMapGraphSidebar({
  projectId,
  mode,
  graphData,
  breadcrumb,
  structureLayout,
  focusLayout,
  focusedNode,
  selectedNode,
  selectedBlastRadius,
  selectedNodeCycles,
  allCycleNodeIds,
  relationMode,
  onBackOneLevel,
  onBackToOverview,
  onBackToStructure,
  onRelationModeChange,
  onFocusSelectedNode,
  onOpenDrawer,
  onCopyPath,
}: ProjectMapGraphSidebarProps) {
  return (
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
              <span className="font-mono">{graphData.stats.folderCount}</span>
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
            onClick={onBackOneLevel}
          >
            <ArrowLeft className="size-4" />
            Back one level
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2"
            onClick={onBackToOverview}
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
            onClick={onBackToStructure}
          >
            <ArrowLeft className="size-4" />
            Back to structure
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2"
            onClick={onBackToOverview}
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
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Left side shows files that use this file. Right side shows files
              this file imports.
            </p>
          </div>

          <Separator />
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Used by</span>
              <span className="font-mono">{focusedNode?.incomingCount ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Imports</span>
              <span className="font-mono">{focusedNode?.outgoingCount ?? 0}</span>
            </div>
            <p className="pt-1 text-[11px] leading-relaxed">
              Arrows always point from the importing file to the imported file.
            </p>
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
                Blast radius: {selectedBlastRadius.totalCount} impacted files
              </p>
              <p className="mt-1 text-fuchsia-100/75">
                Reverse dependency closure: files that import this file, then
                files importing those files.
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
                {selectedNode.language ? <span>{selectedNode.language}</span> : null}
                <span>↓ {selectedNode.incomingCount} used by</span>
                <span>↑ {selectedNode.outgoingCount} imports</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Left/importers are files depending on this file.
                Right/dependencies are files this file depends on.
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
                  onClick={() => onRelationModeChange(item)}
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
                onClick={() => onFocusSelectedNode(relationMode)}
              >
                <Search className="size-3.5" />
                Focus relations
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full justify-start gap-1.5 px-2 text-xs"
                onClick={() => onOpenDrawer(selectedNode.id)}
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
                  onClick={() => onCopyPath(selectedNode.path)}
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

            {relationMode === "cycles" && selectedNodeCycles.length === 0 ? (
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
  );
}
