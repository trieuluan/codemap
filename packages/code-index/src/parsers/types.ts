export type RepoFileParseStatus =
  | "parsed"
  | "skipped"
  | "too_large"
  | "binary"
  | "unsupported"
  | "error";

export type RepoSymbolKind =
  | "module"
  | "namespace"
  | "class"
  | "interface"
  | "trait"
  | "mixin"
  | "enum"
  | "enum_member"
  | "function"
  | "component"
  | "method"
  | "constructor"
  | "property"
  | "field"
  | "variable"
  | "constant"
  | "type_alias"
  | "parameter";

export type RepoSymbolRelationshipKind =
  | "implements"
  | "extends"
  | "type_of"
  | "calls"
  | "references"
  | "overrides"
  | "exports_from"
  | "imports_from"
  | "defines";

export type RepoImportKind =
  | "import"
  | "require"
  | "dynamic_import"
  | "export_from"
  | "include"
  | "use";

export type RepoImportResolutionKind =
  | "relative_path"
  | "tsconfig_alias"
  | "package"
  | "unresolved"
  | "builtin";

export type RepoExportKind =
  | "named"
  | "default"
  | "wildcard"
  | "re_export";

export type RepoParseIssueSeverity = "info" | "warning" | "error";

export interface ParsedParseIssueDraft {
  projectImportId: string;
  fileId?: string | null;
  severity: RepoParseIssueSeverity;
  code?: string | null;
  message: string;
  detailJson?: unknown;
}

export interface ParsedExternalSymbolDraft {
  projectImportId: string;
  symbolKey: string;
  packageManager: string | null;
  packageName: string | null;
  packageVersion: string | null;
  language: string | null;
  displayName: string | null;
  kind: string | null;
  documentationJson: unknown;
  extraJson: unknown;
}

export interface ParsedSymbolDraft {
  localKey: string;   // filePath#kind:displayName — name-based, for export/occurrence linking
  stableKey: string;  // filePath#kind:displayName:line — unique per location, for DB constraint
  displayName: string;
  kind: RepoSymbolKind;
  language: string;
  signature: string | null;
  returnType: string | null;
  doc: string | null;
  isExported: boolean;
  isDefaultExport: boolean;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  parentSymbolLocalKey?: string; // set for methods extracted from factory return objects
}

export interface ParsedImportDraft {
  localKey: string;
  moduleSpecifier: string;
  importKind: RepoImportKind;
  isTypeOnly: boolean;
  importedNames: string[];
  namespaceName?: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  resolutionKind: RepoImportResolutionKind;
  targetPathText: string | null;
  targetExternalSymbolKey: string | null;
}

export interface ParsedExportDraft {
  exportName: string;
  exportKind: RepoExportKind;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  symbolLocalKey?: string;
  sourceImportLocalKey?: string;
  targetExternalSymbolKey?: string | null;
}

export interface ParsedRelationshipDraft {
  fromSymbolLocalKey: string;
  toSymbolName: string;
  relationshipKind: RepoSymbolRelationshipKind;
}

export interface ParsedCallDraft {
  calleeName: string;
  namespaceName?: string;
  line: number;
  col: number;
  endCol: number;
}

export interface ParsedWorkspaceSemantics {
  symbols: ParsedSymbolDraft[];
  imports: ParsedImportDraft[];
  exports: ParsedExportDraft[];
  relationships: ParsedRelationshipDraft[];
  calls: ParsedCallDraft[];
  issues: ParsedParseIssueDraft[];
  externalSymbols: ParsedExternalSymbolDraft[];
}

export const EMPTY_SEMANTICS: ParsedWorkspaceSemantics = {
  symbols: [],
  imports: [],
  exports: [],
  relationships: [],
  calls: [],
  issues: [],
  externalSymbols: [],
};
