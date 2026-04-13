"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  Project,
  ProjectImport,
  ProjectMapSnapshot,
} from "@/lib/api/projects";
import { DetailPanel } from "./detail-panel";
import {
  findRepositoryNodeById,
  getAncestorNodeIds,
  getFirstSelectableRepositoryNode,
  mapProjectTreeToRepositoryNodes,
  pruneExpandedNodeIds,
  type RepositoryTreeNode,
} from "./file-tree-model";
import { FileTree } from "./file-tree-explorer";
import { ProjectMapStatusBanner } from "./project-map-status-banner";

type MapView = "structure" | "dependencies" | "entry-points";

function areNodeIdListsEqual(currentIds: string[], nextIds: string[]) {
  if (currentIds.length !== nextIds.length) {
    return false;
  }

  return currentIds.every((id, index) => id === nextIds[index]);
}

export function ProjectMapShell({
  project,
  imports,
  mapSnapshot,
}: {
  project: Project;
  imports: ProjectImport[];
  mapSnapshot: ProjectMapSnapshot | null;
}) {
  const [activeView, setActiveView] = useState<MapView>("structure");
  const fileTree = useMemo(
    () => mapProjectTreeToRepositoryNodes(mapSnapshot?.tree),
    [mapSnapshot?.tree],
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(
    getFirstSelectableRepositoryNode(fileTree)?.id,
  );
  const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>(
    getAncestorNodeIds(fileTree, getFirstSelectableRepositoryNode(fileTree)?.id),
  );
  const latestImport = imports[0] ?? null;
  const hasMapSnapshot = Boolean(mapSnapshot);
  const isImportProcessing =
    project.status === "importing" ||
    latestImport?.status === "pending" ||
    latestImport?.status === "running";
  const selectedNode = useMemo(
    () => findRepositoryNodeById(fileTree, selectedNodeId),
    [fileTree, selectedNodeId],
  );

  useEffect(() => {
    if (!fileTree.length) {
      if (selectedNodeId !== undefined) {
        setSelectedNodeId(undefined);
      }

      if (expandedNodeIds.length > 0) {
        setExpandedNodeIds([]);
      }

      return;
    }

    const fallbackSelectionId = getFirstSelectableRepositoryNode(fileTree)?.id;
    const nextSelectedNodeId =
      selectedNodeId && findRepositoryNodeById(fileTree, selectedNodeId)
        ? selectedNodeId
        : fallbackSelectionId;
    const nextExpandedNodeIds = pruneExpandedNodeIds(fileTree, expandedNodeIds);
    const resolvedExpandedNodeIds =
      nextExpandedNodeIds.length > 0
        ? nextExpandedNodeIds
        : getAncestorNodeIds(fileTree, nextSelectedNodeId);

    if (nextSelectedNodeId !== selectedNodeId) {
      setSelectedNodeId(nextSelectedNodeId);
    }

    if (!areNodeIdListsEqual(expandedNodeIds, resolvedExpandedNodeIds)) {
      setExpandedNodeIds(resolvedExpandedNodeIds);
    }
  }, [expandedNodeIds, fileTree, selectedNodeId]);

  return (
    <div className="space-y-6">
      <ProjectMapStatusBanner project={project} imports={imports} />

      {hasMapSnapshot && selectedNode ? (
        <div className="rounded-lg border border-border/70 bg-card">
          <div className="border-b border-border/70 px-4 py-4">
            <Tabs
              value={activeView}
              onValueChange={(value: string) => setActiveView(value as MapView)}
              className="w-full"
            >
              <TabsList className="grid w-full max-w-md grid-cols-3">
                <TabsTrigger value="structure">Structure</TabsTrigger>
                <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
                <TabsTrigger value="entry-points">Entry Points</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid h-[680px] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="border-r border-border/70 bg-sidebar">
              <FileTree
                tree={fileTree}
                selectedNodeId={selectedNode.id}
                expandedNodeIds={expandedNodeIds}
                onSelectNode={(node: RepositoryTreeNode) => {
                  setSelectedNodeId(node.id);
                }}
                onExpandedChange={setExpandedNodeIds}
              />
            </div>
            <div className="min-w-0">
              <DetailPanel file={selectedNode} activeView={activeView} />
            </div>
          </div>
        </div>
      ) : (
        <Empty className="min-h-[420px] rounded-lg border border-dashed border-border bg-card p-10">
          <EmptyHeader>
            <EmptyTitle>
              {isImportProcessing
                ? "Project map is being prepared"
                : "No code map available yet"}
            </EmptyTitle>
            <EmptyDescription>
              {isImportProcessing
                ? "The first import has started. Once an import completes, this page will unlock the structure explorer."
                : "Run an import from the project overview to generate the first project map snapshot."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
