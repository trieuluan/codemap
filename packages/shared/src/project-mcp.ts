export type EditLocationConfidence = "high" | "medium" | "low";

export type EditLocationNextTool =
  | "get_file"
  | "find_usages"
  | "find_callers"
  | "get_project_map";

export interface EditLocationSymbol {
  id: string;
  name: string;
  kind: string;
  startLine: number | null;
  endLine: number | null;
}

export type EditLocationReadInclude = "outline" | "symbols" | "content";

export interface EditLocationReadPlan {
  include: EditLocationReadInclude[];
  symbolNames?: string[];
  startLine?: number;
  endLine?: number;
}

export interface EditLocationSuggestion {
  path: string;
  language: string | null;
  confidence: EditLocationConfidence;
  score: number;
  reason: string;
  signals: string[];
  relevantSymbols: EditLocationSymbol[];
  suggestedNextTools: EditLocationNextTool[];
  readPlan: EditLocationReadPlan;
}

export interface EditLocationsResponse {
  query: string;
  projectId: string;
  importId: string;
  suggestions: EditLocationSuggestion[];
  meta: {
    source: "deterministic_search_and_graph";
    staleness: "latest_import";
  };
}

export type SymbolUsageConfidence =
  | "definite"
  | "probable"
  | "potential"
  | "text_only";

export interface SymbolUsageRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface SymbolUsageTarget {
  id: string;
  displayName: string;
  symbolKind: string;
  signature: string | null;
  fileId: string | null;
  filePath: string | null;
  parentSymbolId?: string | null;
  parentSymbolName: string | null;
  isExported: boolean;
  isDefaultExport: boolean;
  range: SymbolUsageRange | null;
}

export interface SymbolOccurrenceUsage {
  id: string;
  fileId: string;
  filePath: string;
  role: string;
  range: SymbolUsageRange;
  syntaxKind: string | null;
  snippetPreview: string | null;
  confidence: SymbolUsageConfidence;
}

export interface SymbolCaller {
  fileId: string;
  filePath: string;
  evidence:
    | "symbol_relationship"
    | "named_import"
    | "namespace_or_wildcard_import"
    | "occurrence";
  relationshipKind?: string;
  importKind?: string;
  moduleSpecifier?: string;
  importedNames?: string[];
  occurrenceRole?: string;
  range: SymbolUsageRange | null;
  confidence: SymbolUsageConfidence;
  snippetPreview?: string | null;
}

export interface SymbolUsagesResponse {
  target: SymbolUsageTarget;
  definitions: SymbolOccurrenceUsage[];
  usages: SymbolOccurrenceUsage[];
  callers: SymbolCaller[];
  totals: {
    definitions: number;
    usages: number;
    callers: number;
  };
  meta: {
    projectImportId: string;
    projectId?: string;
    mapSnapshotId?: string;
    importStatus?: string;
    parseStatus?: string;
    parsedAt?: string | null;
    source: string;
    staleness: string;
  };
}
