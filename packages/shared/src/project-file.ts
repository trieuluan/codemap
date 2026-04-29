import type { ProjectImportParseStatus, ProjectParsedFileStatus } from "./project-entities";

export type ProjectFileContentStatus =
  | "ready"
  | "binary"
  | "too_large"
  | "unsupported"
  | "unavailable";
export type ProjectFileContentKind = "text" | "image" | "binary";

export interface ProjectFileContent {
  path: string;
  name: string;
  type: "file" | "directory";
  extension: string | null;
  language: string | null;
  kind: ProjectFileContentKind;
  mimeType: string | null;
  status: ProjectFileContentStatus;
  content: string | null;
  sizeBytes: number | null;
  reason: string | null;
}

export interface ProjectParsedFileDetail {
  fileId: string | null;
  path: string;
  language: string | null;
  lineCount: number | null;
  parseStatus: ProjectParsedFileStatus;
  sizeBytes: number | null;
  mimeType: string | null;
  extension: string | null;
  importParseStatus: ProjectImportParseStatus;
}

export interface ProjectFileSymbol {
  id: string;
  displayName: string;
  kind: string;
  signature: string | null;
  isExported: boolean;
  parentSymbolName: string | null;
  startLine: number | null;
  startCol: number | null;
  endLine: number | null;
  endCol: number | null;
}

export interface ProjectFileImportEdge {
  id: string;
  moduleSpecifier: string;
  importKind: string;
  isResolved: boolean;
  resolutionKind: string;
  targetPathText: string | null;
  targetExternalSymbolKey: string | null;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface ProjectFileIncomingImportEdge {
  id: string;
  sourceFileId: string;
  sourceFilePath: string;
  moduleSpecifier: string;
  importKind: string;
  resolutionKind: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface ProjectFileExport {
  id: string;
  symbolId: string | null;
  exportName: string;
  exportKind: string;
  symbolDisplayName: string | null;
  sourceModuleSpecifier: string | null;
  symbolStartLine: number | null;
  symbolStartCol: number | null;
  symbolEndLine: number | null;
  symbolEndCol: number | null;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
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

export interface ProjectInsightCycleCandidate {
  paths: string[];
  edgeCount: number;
  kind: "direct" | "scc";
  summary: string;
}

export interface ProjectFileParseData {
  file: ProjectParsedFileDetail;
  imports: ProjectFileImportEdge[];
  importedBy: ProjectFileIncomingImportEdge[];
  exports: ProjectFileExport[];
  symbols: ProjectFileSymbol[];
  blastRadius: ProjectFileBlastRadius;
  cycles: ProjectInsightCycleCandidate[];
}

export interface FileReparseResult {
  reparsed: boolean;
  reason?: "already_fresh";
}
