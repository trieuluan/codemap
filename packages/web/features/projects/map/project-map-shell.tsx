"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Search, X } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FileKind } from "@/lib/file-types";
import type {
  Project,
  ProjectFileContent,
  ProjectImport,
  ProjectMapSnapshot,
} from "@/lib/api/projects";
import { getProjectFileContent } from "@/lib/api/projects";
import { DetailPanel } from "./detail-panel";
import {
  collectFolderNodeIds,
  collectRepositoryKinds,
  collectRepositoryLanguages,
  filterRepositoryTree,
  findRepositoryNodeById,
  getAncestorNodeIds,
  getFirstSelectableRepositoryNode,
  mapProjectTreeToRepositoryNodes,
  pruneExpandedNodeIds,
  type RepositoryTreeNode,
} from "./file-tree-model";
import { FileTree } from "./file-tree-explorer";
import { ProjectFileViewer } from "./project-file-viewer";
import { ProjectMapStatusBanner } from "./project-map-status-banner";

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
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<FileKind | "all">("all");
  const [languageFilter, setLanguageFilter] = useState<string | "all">("all");
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
  const availableKinds = useMemo(() => collectRepositoryKinds(fileTree), [fileTree]);
  const availableLanguages = useMemo(
    () => collectRepositoryLanguages(fileTree),
    [fileTree],
  );
  const filteredTree = useMemo(
    () =>
      filterRepositoryTree(fileTree, {
        query,
        kind: kindFilter,
        language: languageFilter,
      }),
    [fileTree, kindFilter, languageFilter, query],
  );
  const isFiltering =
    query.trim().length > 0 || kindFilter !== "all" || languageFilter !== "all";
  const effectiveExpandedNodeIds = useMemo(
    () =>
      isFiltering ? collectFolderNodeIds(filteredTree) : expandedNodeIds,
    [expandedNodeIds, filteredTree, isFiltering],
  );
  const selectedNode = useMemo(
    () => findRepositoryNodeById(filteredTree, selectedNodeId),
    [filteredTree, selectedNodeId],
  );
  const selectedFileNode =
    selectedNode?.type === "file" && selectedNode.path ? selectedNode : null;
  const {
    data: selectedFileContent,
    error: selectedFileContentError,
    isLoading: isSelectedFileContentLoading,
    mutate: mutateSelectedFileContent,
  } = useSWR<ProjectFileContent>(
    selectedFileNode && mapSnapshot?.importId
      ? ["project-file-content", project.id, mapSnapshot.importId, selectedFileNode.path]
      : null,
    ([, currentProjectId, , filePath]) =>
      getProjectFileContent(currentProjectId as string, filePath as string),
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      keepPreviousData: false,
    },
  );

  useEffect(() => {
    if (!filteredTree.length) {
      if (selectedNodeId !== undefined) {
        setSelectedNodeId(undefined);
      }

      if (expandedNodeIds.length > 0) {
        setExpandedNodeIds([]);
      }

      return;
    }

    const fallbackSelectionId = getFirstSelectableRepositoryNode(filteredTree)?.id;
    const nextSelectedNodeId =
      selectedNodeId && findRepositoryNodeById(filteredTree, selectedNodeId)
        ? selectedNodeId
        : fallbackSelectionId;
    const nextExpandedNodeIds = pruneExpandedNodeIds(fileTree, expandedNodeIds);
    const resolvedExpandedNodeIds =
      isFiltering
        ? collectFolderNodeIds(filteredTree)
        : nextExpandedNodeIds.length > 0
        ? nextExpandedNodeIds
        : getAncestorNodeIds(fileTree, nextSelectedNodeId);

    if (nextSelectedNodeId !== selectedNodeId) {
      setSelectedNodeId(nextSelectedNodeId);
    }

    if (!areNodeIdListsEqual(expandedNodeIds, resolvedExpandedNodeIds)) {
      setExpandedNodeIds(resolvedExpandedNodeIds);
    }
  }, [expandedNodeIds, fileTree, filteredTree, isFiltering, selectedNodeId]);

  return (
    <div className="space-y-6">
      <ProjectMapStatusBanner project={project} imports={imports} />

      {hasMapSnapshot ? (
        <div className="rounded-lg border border-border/70 bg-card">
          <div className="grid h-[760px] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col border-r border-border/70 bg-sidebar">
              <div className="space-y-3 border-b border-sidebar-border px-4 py-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search files"
                    className="pl-9"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <Select
                      value={kindFilter}
                      onValueChange={(value: string) =>
                        setKindFilter(value as FileKind | "all")
                      }
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue placeholder="Filter kind" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All kinds</SelectItem>
                        {availableKinds.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {kind}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <Select
                      value={languageFilter}
                      onValueChange={(value: string) => setLanguageFilter(value)}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue placeholder="Filter language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All languages</SelectItem>
                        {availableLanguages.map((language) => (
                          <SelectItem key={language} value={language}>
                            {language}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {isFiltering ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {filteredTree.length > 0
                        ? "Showing filtered repository results."
                        : "No matching files or folders."}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setQuery("");
                        setKindFilter("all");
                        setLanguageFilter("all");
                      }}
                    >
                      <X className="size-4" />
                      Reset
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="min-h-0 flex-1">
                {filteredTree.length > 0 ? (
                  <FileTree
                    tree={filteredTree}
                    selectedNodeId={selectedNode?.id}
                    expandedNodeIds={effectiveExpandedNodeIds}
                    onSelectNode={(node: RepositoryTreeNode) => {
                      setSelectedNodeId(node.id);
                    }}
                    onExpandedChange={setExpandedNodeIds}
                  />
                ) : (
                  <Empty className="m-4 min-h-[220px] border border-dashed border-sidebar-border bg-sidebar p-6">
                    <EmptyHeader>
                      <EmptyTitle>No matching files</EmptyTitle>
                      <EmptyDescription>
                        Adjust the search term or filters to find a file in this
                        repository snapshot.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setQuery("");
                          setKindFilter("all");
                          setLanguageFilter("all");
                        }}
                      >
                        Reset filters
                      </Button>
                    </EmptyContent>
                  </Empty>
                )}
              </div>
            </div>
            <div className="grid min-h-0 grid-rows-[minmax(0,1.2fr)_minmax(0,0.95fr)] border-t border-border/70 lg:border-t-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] xl:grid-rows-1">
              <div className="min-w-0 border-b border-border/70 xl:border-r xl:border-b-0">
                <ProjectFileViewer
                  selectedNode={selectedNode}
                  fileContent={selectedFileContent}
                  isLoading={isSelectedFileContentLoading}
                  error={selectedFileContentError}
                  onRetry={() => {
                    void mutateSelectedFileContent();
                  }}
                />
              </div>
              <div className="min-w-0">
                {selectedNode ? (
                  <DetailPanel file={selectedNode} />
                ) : (
                  <Empty className="h-full rounded-none border-0 bg-transparent p-10">
                    <EmptyHeader>
                      <EmptyTitle>No file selected</EmptyTitle>
                      <EmptyDescription>
                        No repository nodes match the current search or filter.
                        Reset the filters or search for another file to inspect its
                        details.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setQuery("");
                          setKindFilter("all");
                          setLanguageFilter("all");
                        }}
                      >
                        Reset filters
                      </Button>
                    </EmptyContent>
                  </Empty>
                )}
              </div>
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
