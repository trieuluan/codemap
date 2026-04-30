/** Shared response types for the CodeMap API used across MCP tools. */

import type {
  Project,
  ProjectAnalysisSummary,
  ProjectFileBlastRadius,
  ProjectFileContent,
  ProjectFileContentKind,
  ProjectFileContentStatus,
  ProjectImport,
  ProjectImportParseStatus,
  ProjectImportStatus,
  ProjectMapInsightsResponse,
  ProjectMapSearchExportResult,
  ProjectMapSearchFileResult,
  ProjectMapSearchResponse,
  ProjectMapSearchSymbolResult,
} from "@codemap/shared";

export type {
  EditLocationConfidence,
  EditLocationNextTool,
  EditLocationReadInclude,
  EditLocationReadPlan,
  EditLocationSuggestion,
  EditLocationSymbol,
  EditLocationsResponse,
  FileReparseResult,
  GithubRepository,
  GithubStatus,
  Project,
  ProjectFileContent,
  ProjectImport,
  ProjectMapSnapshot,
  ProjectMapTreeNode,
  ProjectSourceImportResult,
  SymbolCaller,
  SymbolOccurrenceUsage,
  SymbolUsageConfidence,
  SymbolUsageRange,
  SymbolUsageTarget,
  SymbolUsagesResponse,
} from "@codemap/shared";

export type ImportStatus = ProjectImportStatus;
export type ParseStatus = ProjectImportParseStatus;
export type ProjectDetail = Project;
export type ProjectImportDetail = ProjectImport;
export type TriggerImportResult = ProjectImport;

export type FileContentStatus = ProjectFileContentStatus;
export type FileContentKind = ProjectFileContentKind;
export type FileContent = ProjectFileContent;

export type SearchFileResult = ProjectMapSearchFileResult;
export type SearchSymbolResult = ProjectMapSearchSymbolResult;
export type SearchExportResult = ProjectMapSearchExportResult;
export type CodebaseSearchResponse = ProjectMapSearchResponse;

export type BlastRadius = ProjectFileBlastRadius;

export type InsightsFileEntry =
  ProjectMapInsightsResponse["topFilesByImportCount"][number];
export type InsightsFolderEntry =
  ProjectMapInsightsResponse["topFoldersBySourceFileCount"][number];
export type InsightsEntryLikeFile =
  ProjectMapInsightsResponse["entryLikeFiles"][number];
export type InsightsCycleCandidate =
  ProjectMapInsightsResponse["circularDependencyCandidates"][number];
export type ProjectInsightsSummary = ProjectMapInsightsResponse;
export type ProjectAnalysisSummaryResponse = ProjectAnalysisSummary;
