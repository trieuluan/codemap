import type {
  RepoExportInsert,
  RepoExternalSymbolInsert,
  RepoImportEdgeInsert,
  RepoParseIssueInsert,
  RepoSymbolInsert,
  RepoSymbolRelationshipInsert,
} from "../../../../db/schema";

export interface ParsedSymbolDraft {
  localKey: string;   // filePath#kind:displayName — name-based, for export/occurrence linking
  stableKey: string;  // filePath#kind:displayName:line — unique per location, for DB constraint
  displayName: string;
  kind: RepoSymbolInsert["kind"];
  language: string;
  signature: string | null;
  returnType: string | null;
  doc: string | null;
  isExported: boolean;
  isDefaultExport: boolean;
  line: number;
  col: number;
  endCol: number;
}

export interface ParsedImportDraft {
  localKey: string;
  moduleSpecifier: string;
  importKind: RepoImportEdgeInsert["importKind"];
  isTypeOnly: boolean;
  line: number;
  col: number;
  endCol: number;
  resolutionKind: RepoImportEdgeInsert["resolutionKind"];
  targetPathText: string | null;
  targetExternalSymbolKey: string | null;
}

export interface ParsedExportDraft {
  exportName: string;
  exportKind: RepoExportInsert["exportKind"];
  line: number;
  col: number;
  endCol: number;
  symbolLocalKey?: string;
  sourceImportLocalKey?: string;
  targetExternalSymbolKey?: string | null;
}

export interface ParsedRelationshipDraft {
  fromSymbolLocalKey: string;
  toSymbolName: string;
  relationshipKind: RepoSymbolRelationshipInsert["relationshipKind"];
}

export interface ParsedWorkspaceSemantics {
  symbols: ParsedSymbolDraft[];
  imports: ParsedImportDraft[];
  exports: ParsedExportDraft[];
  relationships: ParsedRelationshipDraft[];
  issues: RepoParseIssueInsert[];
  externalSymbols: RepoExternalSymbolInsert[];
}

export const EMPTY_SEMANTICS: ParsedWorkspaceSemantics = {
  symbols: [],
  imports: [],
  exports: [],
  relationships: [],
  issues: [],
  externalSymbols: [],
};
