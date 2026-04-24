"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import type {
  ProjectAnalysisSummary,
  Project,
  ProjectFileContent,
  ProjectFileParseData,
  ProjectImport,
  ProjectMapSnapshot,
} from "@/features/projects/api";
import { browserProjectsApi } from "@/features/projects/api";
import { DetailPanel } from "./components/detail-panel";
import {
  collectFolderNodeIds,
  collectRepositoryKinds,
  collectRepositoryLanguages,
  filterRepositoryTree,
  findRepositoryNodeById,
  findRepositoryNodeByPath,
  getAncestorNodeIds,
  getAncestorNodeIdsByPath,
  getFirstSelectableRepositoryNode,
  mapProjectTreeToRepositoryNodes,
  pruneExpandedNodeIds,
  type RepositoryTreeNode,
} from "./utils/file-tree-model";
import {
  ProjectFileViewer,
  type ProjectViewerRange,
} from "./components/project-file-viewer";
import { ProjectMapSidebar } from "./components/project-map-sidebar";
import { useMapFilters } from "../hooks/use-map-filters";
import { ProjectMapStatusBanner } from "../components/status/project-map-status-banner";

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
  initialSelectedFilePath,
}: {
  project: Project;
  imports: ProjectImport[];
  mapSnapshot: ProjectMapSnapshot | null;
  initialSelectedFilePath?: string | null;
}) {
  const defaultRelationshipSections = ["imports", "imported-by"];
  const [activeDetailTab, setActiveDetailTab] = useState("details");
  const [openRelationshipSections, setOpenRelationshipSections] = useState<
    string[]
  >(defaultRelationshipSections);
  const [selectedEditorRange, setSelectedEditorRange] =
    useState<ProjectViewerRange | null>(null);
  const preserveRelationshipSectionsRef = useRef(false);

  const fileTree = useMemo(
    () => mapProjectTreeToRepositoryNodes(mapSnapshot?.tree),
    [mapSnapshot?.tree],
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(
    getFirstSelectableRepositoryNode(fileTree)?.id,
  );
  const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>(
    getAncestorNodeIds(
      fileTree,
      getFirstSelectableRepositoryNode(fileTree)?.id,
    ),
  );

  const latestImport = imports[0] ?? null;
  const hasMapSnapshot = Boolean(mapSnapshot);
  const isImportProcessing =
    project.status === "importing" ||
    latestImport?.status === "pending" ||
    latestImport?.status === "running";
  const {
    query,
    setQuery,
    kindFilter,
    setKindFilter,
    languageFilter,
    setLanguageFilter,
    isFiltering,
    resetFilters: resetTreeFilters,
  } = useMapFilters();
  const availableKinds = useMemo(
    () => collectRepositoryKinds(fileTree),
    [fileTree],
  );
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
  const effectiveExpandedNodeIds = useMemo(
    () => (isFiltering ? collectFolderNodeIds(filteredTree) : expandedNodeIds),
    [expandedNodeIds, filteredTree, isFiltering],
  );
  const selectedNode = useMemo(
    () => findRepositoryNodeById(fileTree, selectedNodeId),
    [fileTree, selectedNodeId],
  );
  const selectedVisibleNode = useMemo(
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
      ? [
          "project-file-content",
          project.id,
          mapSnapshot.importId,
          selectedFileNode.path,
        ]
      : null,
    ([, currentProjectId, , filePath]: [string, string, string, string]) =>
      browserProjectsApi.getProjectFileContent(
        currentProjectId as string,
        filePath as string,
      ),
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      keepPreviousData: false,
    },
  );
  const {
    data: selectedFileParseData,
    isLoading: isSelectedFileParseDataLoading,
  } = useSWR<ProjectFileParseData>(
    selectedFileNode && mapSnapshot?.importId
      ? [
          "project-file-parse",
          project.id,
          mapSnapshot.importId,
          selectedFileNode.path,
        ]
      : null,
    ([, currentProjectId, , filePath]: [string, string, string, string]) =>
      browserProjectsApi.getProjectFileParseData(
        currentProjectId as string,
        filePath as string,
      ),
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      keepPreviousData: false,
    },
  );
  const { data: projectAnalysisSummary, isLoading: isProjectAnalysisLoading } =
    useSWR<ProjectAnalysisSummary>(
      mapSnapshot?.importId
        ? ["project-analysis", project.id, mapSnapshot.importId]
        : null,
      ([, currentProjectId]: [string, string, string]) =>
        browserProjectsApi.getProjectAnalysisSummary(
          currentProjectId as string,
        ),
      {
        revalidateOnFocus: false,
        revalidateIfStale: false,
        keepPreviousData: true,
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

    const fallbackSelectionId =
      getFirstSelectableRepositoryNode(filteredTree)?.id;
    const nextSelectedNodeId =
      selectedNodeId && findRepositoryNodeById(fileTree, selectedNodeId)
        ? selectedNodeId
        : fallbackSelectionId;
    const nextExpandedNodeIds = pruneExpandedNodeIds(fileTree, expandedNodeIds);
    const resolvedExpandedNodeIds = isFiltering
      ? effectiveExpandedNodeIds
      : nextExpandedNodeIds.length > 0
        ? nextExpandedNodeIds
        : getAncestorNodeIds(fileTree, nextSelectedNodeId);

    if (nextSelectedNodeId !== selectedNodeId) {
      setSelectedNodeId(nextSelectedNodeId);
    }

    if (!areNodeIdListsEqual(expandedNodeIds, resolvedExpandedNodeIds)) {
      setExpandedNodeIds(resolvedExpandedNodeIds);
    }
  }, [
    effectiveExpandedNodeIds,
    expandedNodeIds,
    fileTree,
    filteredTree,
    isFiltering,
    selectedNodeId,
  ]);

  useEffect(() => {
    setSelectedEditorRange(null);
  }, [selectedFileNode?.path]);

  useEffect(() => {
    if (!initialSelectedFilePath) {
      return;
    }

    const targetNode = findRepositoryNodeByPath(
      fileTree,
      initialSelectedFilePath,
    );

    if (!targetNode) {
      return;
    }

    setSelectedNodeId(targetNode.id);
    setExpandedNodeIds((currentNodeIds) => {
      const targetAncestorIds = getAncestorNodeIdsByPath(
        fileTree,
        initialSelectedFilePath,
      );
      const nextNodeIds = new Set([...currentNodeIds, ...targetAncestorIds]);
      return Array.from(nextNodeIds);
    });
    setActiveDetailTab("details");
  }, [fileTree, initialSelectedFilePath]);

  useEffect(() => {
    if (
      activeDetailTab === "imports" ||
      activeDetailTab === "imported-by" ||
      activeDetailTab === "exports" ||
      activeDetailTab === "defines"
    ) {
      setActiveDetailTab("relationships");
    }
  }, [activeDetailTab]);

  useEffect(() => {
    if (preserveRelationshipSectionsRef.current) {
      preserveRelationshipSectionsRef.current = false;
      return;
    }

    if (activeDetailTab === "relationships") {
      setOpenRelationshipSections(defaultRelationshipSections);
    }
  }, [activeDetailTab, selectedFileNode?.path]);

  const navigateToFile = (
    filePath: string,
    range?: ProjectViewerRange | null,
    tab?: string,
    relationshipSections?: string[],
  ) => {
    const targetNode = findRepositoryNodeByPath(fileTree, filePath);

    if (!targetNode) {
      return;
    }

    setSelectedNodeId(targetNode.id);
    setExpandedNodeIds((currentNodeIds) => {
      const targetAncestorIds = getAncestorNodeIdsByPath(fileTree, filePath);
      const nextNodeIds = new Set([...currentNodeIds, ...targetAncestorIds]);
      return Array.from(nextNodeIds);
    });

    if (tab) {
      setActiveDetailTab(tab);
    }

    if (relationshipSections) {
      preserveRelationshipSectionsRef.current = true;
      setOpenRelationshipSections(relationshipSections);
    }

    setSelectedEditorRange(range ?? null);
  };

  return (
    <div className="space-y-6">
      <ProjectMapStatusBanner
        project={project}
        imports={imports}
        mapSnapshot={mapSnapshot}
      />

      {hasMapSnapshot ? (
        <div className="rounded-lg border border-border/70 bg-card">
          {/* <div className="border-b border-border/70 px-4 py-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">
                Code explorer
              </h2>
              <p className="text-xs text-muted-foreground">
                Browse retained source, semantic relationships, and project
                analysis.
              </p>
            </div>
          </div> */}
          <div className="grid h-[760px] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
            <ProjectMapSidebar
              query={query}
              onQueryChange={setQuery}
              kindFilter={kindFilter}
              onKindFilterChange={setKindFilter}
              languageFilter={languageFilter}
              onLanguageFilterChange={setLanguageFilter}
              availableKinds={availableKinds}
              availableLanguages={availableLanguages}
              isFiltering={isFiltering}
              filteredTree={filteredTree}
              selectedVisibleNodeId={selectedVisibleNode?.id}
              expandedNodeIds={effectiveExpandedNodeIds}
              onSelectNode={(node: RepositoryTreeNode) => {
                setSelectedNodeId(node.id);
              }}
              onExpandedChange={setExpandedNodeIds}
              onResetFilters={resetTreeFilters}
            />
            <div className="grid min-h-0 grid-rows-[minmax(0,1.2fr)_minmax(0,0.95fr)] border-t border-border/70 lg:border-t-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] xl:grid-rows-1">
              <div className="min-w-0 border-b border-border/70 xl:border-r xl:border-b-0">
                <ProjectFileViewer
                  projectId={project.id}
                  selectedNode={selectedNode ?? null}
                  fileContent={selectedFileContent}
                  isLoading={isSelectedFileContentLoading}
                  error={selectedFileContentError}
                  selectedRange={selectedEditorRange}
                  onRetry={() => {
                    void mutateSelectedFileContent();
                  }}
                />
              </div>
              <div className="min-w-0">
                {selectedNode ? (
                  <DetailPanel
                    projectId={project.id}
                    file={selectedNode}
                    fileContent={selectedFileContent}
                    parseData={
                      selectedFileNode ? selectedFileParseData : undefined
                    }
                    analysisSummary={projectAnalysisSummary}
                    parseDataLoading={
                      Boolean(selectedFileNode) &&
                      isSelectedFileParseDataLoading
                    }
                    analysisLoading={isProjectAnalysisLoading}
                    activeTab={activeDetailTab}
                    onActiveTabChange={setActiveDetailTab}
                    openRelationshipSections={openRelationshipSections}
                    onOpenRelationshipSectionsChange={
                      setOpenRelationshipSections
                    }
                    onNavigateToSymbol={(symbol) => {
                      if (!selectedFileNode?.path) {
                        return;
                      }

                      if (
                        !symbol.startLine ||
                        !symbol.startCol ||
                        !symbol.endLine ||
                        !symbol.endCol
                      ) {
                        return;
                      }

                      navigateToFile(
                        selectedFileNode.path,
                        {
                          startLineNumber: symbol.startLine,
                          startColumn: symbol.startCol,
                          endLineNumber: symbol.endLine,
                          endColumn: symbol.endCol,
                        },
                        "relationships",
                        ["defines"],
                      );
                    }}
                    onNavigateToImport={(item) => {
                      if (!item.targetPathText) {
                        return;
                      }

                      navigateToFile(
                        item.targetPathText,
                        null,
                        "relationships",
                        ["imports"],
                      );
                    }}
                    onNavigateToIncomingImport={(item) => {
                      navigateToFile(
                        item.sourceFilePath,
                        {
                          startLineNumber: item.startLine,
                          startColumn: item.startCol,
                          endLineNumber: item.endLine,
                          endColumn: item.endCol,
                        },
                        "relationships",
                        ["imported-by"],
                      );
                    }}
                    onNavigateToExport={(item) => {
                      const linkedDeclarationRange =
                        item.symbolStartLine &&
                        item.symbolStartCol &&
                        item.symbolEndLine &&
                        item.symbolEndCol
                          ? {
                              startLineNumber: item.symbolStartLine,
                              startColumn: item.symbolStartCol,
                              endLineNumber: item.symbolEndLine,
                              endColumn: item.symbolEndCol,
                            }
                          : null;

                      if (!selectedFileNode?.path) {
                        return;
                      }

                      navigateToFile(
                        selectedFileNode.path,
                        linkedDeclarationRange ?? {
                          startLineNumber: item.startLine,
                          startColumn: item.startCol,
                          endLineNumber: item.endLine,
                          endColumn: item.endCol,
                        },
                        "relationships",
                        ["exports"],
                      );
                    }}
                    onNavigateToFile={(path, tab, range) => {
                      navigateToFile(path, range ?? null, tab);
                    }}
                  />
                ) : (
                  <Empty className="h-full rounded-none border-0 bg-transparent p-10">
                    <EmptyHeader>
                      <EmptyTitle>No file selected</EmptyTitle>
                      <EmptyDescription>
                        No repository nodes match the current tree filter. Reset
                        the filters or choose another file to inspect its
                        details.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button variant="outline" onClick={resetTreeFilters}>
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
