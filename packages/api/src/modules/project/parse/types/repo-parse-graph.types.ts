import type {
  ProjectFileRecord,
  RepoExportKind,
  RepoImportKind,
  RepoImportResolutionKind,
  RepoSymbolKind,
  RepoSymbolRelationshipKind,
  RepoSymbolVisibility,
} from "../../../../db/schema";

export const REPO_SYMBOL_KIND_VALUES = [
  "module",
  "namespace",
  "class",
  "interface",
  "trait",
  "mixin",
  "enum",
  "enum_member",
  "function",
  "component",
  "method",
  "constructor",
  "property",
  "field",
  "variable",
  "constant",
  "type_alias",
  "parameter",
] as const;

export interface ProjectImportEdge {
  id: string;
  projectImportId: string;
  sourceFileId: string;
  sourceFilePath: string;
  targetFileId: string | null;
  targetFilePath: string | null;
  targetPathText: string | null;
  targetExternalSymbolKey: string | null;
  moduleSpecifier: string;
  importKind: RepoImportKind;
  isTypeOnly: boolean;
  isResolved: boolean;
  resolutionKind: RepoImportResolutionKind;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  extraJson: unknown;
  createdAt: Date;
}

export interface ProjectSymbol {
  id: string;
  projectImportId: string;
  fileId: string | null;
  filePath: string | null;
  stableSymbolKey: string | null;
  localSymbolKey: string | null;
  displayName: string;
  kind: RepoSymbolKind;
  language: string | null;
  visibility: RepoSymbolVisibility;
  isExported: boolean;
  isDefaultExport: boolean;
  signature: string | null;
  returnType: string | null;
  parentSymbolId: string | null;
  parentSymbolName: string | null;
  ownerSymbolKey: string | null;
  docJson: unknown;
  typeJson: unknown;
  modifiersJson: unknown;
  extraJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectExportRecord {
  id: string;
  projectImportId: string;
  fileId: string;
  filePath: string;
  symbolId: string | null;
  symbolDisplayName: string | null;
  exportName: string;
  exportKind: RepoExportKind;
  sourceImportEdgeId: string | null;
  sourceModuleSpecifier: string | null;
  targetExternalSymbolKey: string | null;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  extraJson: unknown;
  createdAt: Date;
}

export interface ProjectSymbolRelationshipRecord {
  id: string;
  projectImportId: string;
  fromSymbolId: string;
  fromSymbolName: string;
  toSymbolId: string | null;
  toSymbolName: string | null;
  toExternalSymbolKey: string | null;
  relationshipKind: RepoSymbolRelationshipKind;
  isReference: boolean;
  isImplementation: boolean;
  isTypeDefinition: boolean;
  isDefinition: boolean;
  extraJson: unknown;
  createdAt: Date;
}

export interface ProjectImportDiff {
  addedFiles: ProjectFileRecord[];
  removedFiles: ProjectFileRecord[];
  changedFiles: Array<{
    current: ProjectFileRecord;
    previous: ProjectFileRecord;
  }>;
  addedSymbolKeys: string[];
  removedSymbolKeys: string[];
}

export interface ProjectFileSymbolRecord {
  id: string;
  displayName: string;
  kind: RepoSymbolKind;
  signature: string | null;
  isExported: boolean;
  parentSymbolName: string | null;
  startLine: number | null;
  startCol: number | null;
  endLine: number | null;
  endCol: number | null;
}

export interface ProjectFileBlastRadiusEntry {
  path: string;
  language: string | null;
  depth: number;
  incomingCount: number;
  outgoingCount: number;
}

export interface ProjectFileBlastRadius {
  totalCount: number;
  directCount: number;
  maxDepth: number;
  hasCycles: boolean;
  files: ProjectFileBlastRadiusEntry[];
}

export interface ProjectFileAnalysis {
  blastRadius: ProjectFileBlastRadius;
  cycles: ProjectInsightsCycleCandidate[];
}

export interface ProjectAnalysisSummary {
  topFilesByDependencies: Array<{
    path: string;
    outgoingCount: number;
    incomingCount: number;
  }>;
  topFolders: Array<{
    folder: string;
    sourceFileCount: number;
  }>;
  sourceFileDistribution: Array<{
    language: string;
    fileCount: number;
  }>;
  totals: {
    files: number;
    sourceFiles: number;
    parsedFiles: number;
    dependencies: number;
    symbols: number;
  };
}

export interface ProjectInsightsFileEntry {
  path: string;
  language: string | null;
  incomingCount: number;
  outgoingCount: number;
}

export interface ProjectInsightsFolderEntry {
  folder: string;
  sourceFileCount: number;
}

export interface ProjectInsightsEntryLikeFile {
  path: string;
  language: string | null;
  incomingCount: number;
  outgoingCount: number;
  score: number;
  reason: string;
}

export interface ProjectInsightsCycleCandidate {
  paths: string[];
  edgeCount: number;
  kind: "direct" | "scc";
  summary: string;
}

export interface ProjectInsightsSummary {
  topFilesByImportCount: ProjectInsightsFileEntry[];
  topFilesByInboundDependencyCount: ProjectInsightsFileEntry[];
  topFoldersBySourceFileCount: ProjectInsightsFolderEntry[];
  orphanFiles: ProjectInsightsFileEntry[];
  entryLikeFiles: ProjectInsightsEntryLikeFile[];
  circularDependencyCandidates: ProjectInsightsCycleCandidate[];
  totals: {
    files: number;
    sourceFiles: number;
    parsedFiles: number;
    dependencies: number;
    symbols: number;
  };
}

export interface ProjectGraphNode {
  id: string;
  path: string;
  language: string | null;
  dirPath: string;
  incomingCount: number;
  outgoingCount: number;
  isParseable: boolean;
}

export interface ProjectGraphEdge {
  id: string;
  source: string;
  target: string;
  importKind: string;
  isResolved: boolean;
  resolutionKind: string;
}

export interface ProjectGraphCycle {
  kind: "direct" | "scc";
  paths: string[];
  nodeIds: string[];
}

export interface ProjectGraphFolderNode {
  id: string;
  folder: string;
  fileCount: number;
  sourceFileCount: number;
  incomingCount: number;
  outgoingCount: number;
  internalEdgeCount: number;
}

export interface ProjectGraphFolderEdge {
  id: string;
  source: string;
  target: string;
  edgeCount: number;
}

export interface ProjectGraphData {
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  cycles: ProjectGraphCycle[];
  folderNodes: ProjectGraphFolderNode[];
  folderEdges: ProjectGraphFolderEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    cycleCount: number;
    folderCount: number;
    folderEdgeCount: number;
  };
}

export interface ProjectMapSearchFileResult {
  kind: "file";
  path: string;
  language: string | null;
}

export interface ProjectMapSearchSymbolResult {
  kind: "symbol";
  id: string;
  displayName: string;
  symbolKind: RepoSymbolKind;
  filePath: string;
  parentSymbolName: string | null;
  startLine: number | null;
  startCol: number | null;
  endLine: number | null;
  endCol: number | null;
}

export interface ProjectMapSearchExportResult {
  kind: "export";
  id: string;
  exportName: string;
  filePath: string;
  symbolId: string | null;
  symbolStartLine: number | null;
  symbolStartCol: number | null;
  symbolEndLine: number | null;
  symbolEndCol: number | null;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface ProjectMapSearchResponse {
  files: ProjectMapSearchFileResult[];
  symbols: ProjectMapSearchSymbolResult[];
  exports: ProjectMapSearchExportResult[];
}
