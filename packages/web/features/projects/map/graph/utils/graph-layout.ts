// Re-export barrel — implementation split into:
//   graph-layout-shared.ts  (types, constants, ELK helpers)
//   graph-layout-folder.ts  (folder/structure layout)
//   graph-layout-focus.ts   (file focus layout)

export type {
  FolderGraphLayoutResult,
  FolderStructureLayoutResult,
  GraphRelationMode,
  GraphClusterSummary,
  GraphClusterNodeData,
  GraphLayoutResult,
} from "./graph-layout-shared";

export { pickLayoutAlgorithm, buildFolderGraphLayout, buildFolderStructureLayout } from "./graph-layout-folder";
export { relayoutFocusGraph, buildFileFocusGraphLayout } from "./graph-layout-focus";
