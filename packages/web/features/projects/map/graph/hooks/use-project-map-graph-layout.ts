"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectMapGraphResponse } from "@/features/projects/api";
import {
  buildFileFocusGraphLayout,
  buildFolderGraphLayout,
  buildFolderStructureLayout,
  type FolderGraphLayoutResult,
  type FolderStructureLayoutResult,
  type GraphLayoutResult,
  type GraphRelationMode,
} from "../utils/graph-layout";
import type { GraphMode } from "../project-map-graph-shared";

export function useProjectMapGraphLayout({
  graphData,
  mode,
  selectedFolder,
  focusedNodeId,
  relationMode,
  expandedClusters,
}: {
  graphData: ProjectMapGraphResponse;
  mode: GraphMode;
  selectedFolder: string | null;
  focusedNodeId: string | null;
  relationMode: GraphRelationMode;
  expandedClusters: Set<string>;
}) {
  const [folderLayout, setFolderLayout] =
    useState<FolderGraphLayoutResult | null>(null);
  const [structureLayout, setStructureLayout] =
    useState<FolderStructureLayoutResult | null>(null);
  const [focusLayout, setFocusLayout] = useState<GraphLayoutResult | null>(null);
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

  const activeLayout = useMemo(
    () =>
      mode === "overview"
        ? folderLayout
        : mode === "structure"
          ? structureLayout
          : focusLayout,
    [focusLayout, folderLayout, mode, structureLayout],
  );

  return {
    folderLayout,
    structureLayout,
    focusLayout,
    activeLayout,
    isLayouting,
  };
}
