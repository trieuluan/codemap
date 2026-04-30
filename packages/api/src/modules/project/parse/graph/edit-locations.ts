import { and, eq, inArray, or } from "drizzle-orm";
import { repoFile, repoImportEdge } from "../../../../db/schema";
import type {
  ProjectEditLocationNextTool,
  ProjectEditLocationReadPlan,
  ProjectEditLocationSuggestion,
  ProjectEditLocationsResponse,
  ProjectMapSearchResponse,
  ProjectMapSearchExportResult,
  ProjectMapSearchSymbolResult,
} from "../types/repo-parse-graph.types";
import { createSearchService } from "./search";

type Database = typeof import("../../../../db/index.ts").db;

interface Candidate {
  id: string | null;
  path: string;
  language: string | null;
  lineCount: number | null;
  score: number;
  signals: Set<string>;
  demotedSignals: Set<string>;
  reasons: Set<string>;
  relevantSymbols: Map<string, ProjectEditLocationSuggestion["relevantSymbols"][number]>;
}

interface EditLocationFileRecord {
  id: string;
  path: string;
  language: string | null;
  lineCount: number | null;
}

interface EditLocationGraphEdge {
  sourceFile: EditLocationFileRecord;
  targetFile: EditLocationFileRecord | null;
}

const STOP_WORDS = new Set([
  "add",
  "and",
  "app",
  "are",
  "cho",
  "code",
  "codebase",
  "component",
  "components",
  "context",
  "cua",
  "for",
  "from",
  "into",
  "implement",
  "lam",
  "mcp",
  "new",
  "project",
  "the",
  "this",
  "tool",
  "tools",
  "update",
  "v1",
  "vao",
  "with",
]);

const GENERIC_SYMBOL_NAMES = new Set([
  "accordion",
  "alert",
  "button",
  "card",
  "checkbox",
  "command",
  "context",
  "contextmenu",
  "contextmenucontent",
  "contextmenuitem",
  "contextmenuportal",
  "dialog",
  "dropdownmenu",
  "form",
  "input",
  "label",
  "menu",
  "popover",
  "portal",
  "provider",
  "select",
  "separator",
  "sheet",
  "switch",
  "tabs",
  "toast",
  "tooltip",
]);

const CONVENTION_BOOSTS: Array<{
  pattern: RegExp;
  score: number;
  signal: string;
  reason: string;
}> = [
  {
    pattern: /(^|\/)page\.tsx$/,
    score: 14,
    signal: "convention:next_page",
    reason: "Next.js route page convention",
  },
  {
    pattern: /(^|\/)(route|routes)(\/|\.|$)|(^|\/)index\.ts$/,
    score: 10,
    signal: "convention:route",
    reason: "route registration convention",
  },
  {
    pattern: /(^|\/)controller\.ts$/,
    score: 24,
    signal: "convention:controller",
    reason: "API controller convention",
  },
  {
    pattern: /(^|\/)service\.ts$/,
    score: 12,
    signal: "convention:service",
    reason: "business logic service convention",
  },
  {
    pattern: /(^|\/)schema\.ts$/,
    score: 18,
    signal: "convention:schema",
    reason: "request/response schema convention",
  },
  {
    pattern: /(^|\/)tools\//,
    score: 6,
    signal: "convention:mcp_tool",
    reason: "MCP tool convention",
  },
];

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)),
    ),
  );
}

function pathTokenScore(path: string, tokens: string[]) {
  const normalizedPath = path.toLowerCase();
  return tokens.reduce((score, token) => {
    if (normalizedPath.includes(token)) {
      return score + (normalizedPath.split("/").some((part) => part.includes(token)) ? 12 : 6);
    }
    return score;
  }, 0);
}

function nameTokenScore(name: string, tokens: string[]) {
  const nameTokens = new Set(tokenize(name));
  let matchedCount = 0;

  for (const token of tokens) {
    if (nameTokens.has(token)) {
      matchedCount += 1;
    }
  }

  return matchedCount * 12;
}

function getConfidence(candidate: Candidate) {
  const hasDirectSymbolEvidence =
    candidate.signals.has("symbol_match") || candidate.signals.has("export_match");
  const hasPathEvidence = candidate.signals.has("file_path_match");
  const hasCoreConvention =
    candidate.signals.has("convention:next_page") ||
    candidate.signals.has("convention:controller") ||
    candidate.signals.has("convention:service") ||
    candidate.signals.has("convention:schema");

  if (hasDirectSymbolEvidence && candidate.score >= 80) return "high" as const;
  if (hasPathEvidence && hasCoreConvention && candidate.score >= 75) {
    return "high" as const;
  }
  if (candidate.score >= 35) return "medium" as const;
  return "low" as const;
}

function getOrCreateCandidate(
  candidates: Map<string, Candidate>,
  input: {
    id?: string | null;
    path: string;
    language?: string | null;
    lineCount?: number | null;
  },
) {
  const existing = candidates.get(input.path);
  if (existing) {
    if (!existing.id && input.id) existing.id = input.id;
    if (!existing.language && input.language) existing.language = input.language;
    if (existing.lineCount === null && input.lineCount != null) existing.lineCount = input.lineCount;
    return existing;
  }

  const candidate: Candidate = {
    id: input.id ?? null,
    path: input.path,
    language: input.language ?? null,
    lineCount: input.lineCount ?? null,
    score: 0,
    signals: new Set(),
    demotedSignals: new Set(),
    reasons: new Set(),
    relevantSymbols: new Map(),
  };
  candidates.set(input.path, candidate);
  return candidate;
}

function isGenericSymbolName(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return GENERIC_SYMBOL_NAMES.has(normalized);
}

function applyGenericSymbolDemotion(
  candidate: Candidate,
  symbolName: string,
  tokens: string[],
) {
  if (!isGenericSymbolName(symbolName)) return;

  const hasPathEvidence = candidate.signals.has("file_path_match");
  const hasTaskPathCoverage = tokenCoverage(candidate.path, tokens) > 0.2;
  const hasCoreConvention =
    candidate.signals.has("convention:next_page") ||
    candidate.signals.has("convention:controller") ||
    candidate.signals.has("convention:service") ||
    candidate.signals.has("convention:schema") ||
    candidate.signals.has("convention:mcp_tool");

  if (hasPathEvidence || hasTaskPathCoverage || hasCoreConvention) return;

  candidate.score = Math.min(candidate.score, 34);
  candidate.demotedSignals.add("generic_symbol");
  candidate.reasons.add(`generic symbol match: ${symbolName}`);
}

function addRelevantSymbol(
  candidate: Candidate,
  symbol: ProjectMapSearchSymbolResult | ProjectMapSearchExportResult,
) {
  if (symbol.kind === "symbol") {
    candidate.relevantSymbols.set(`symbol:${symbol.id}`, {
      id: symbol.id,
      name: symbol.displayName,
      kind: symbol.symbolKind,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
    });
    return;
  }

  candidate.relevantSymbols.set(`export:${symbol.id}`, {
    id: symbol.symbolId ?? symbol.id,
    name: symbol.exportName,
    kind: "export",
    startLine: symbol.symbolStartLine ?? symbol.startLine,
    endLine: symbol.symbolEndLine ?? symbol.endLine,
  });
}

function applyConventionBoosts(candidate: Candidate) {
  const hasDirectEvidence =
    candidate.signals.has("file_path_match") ||
    candidate.signals.has("symbol_match") ||
    candidate.signals.has("export_match");

  if (!hasDirectEvidence) {
    return;
  }

  for (const boost of CONVENTION_BOOSTS) {
    if (!boost.pattern.test(candidate.path)) continue;
    candidate.score += boost.score;
    candidate.signals.add(boost.signal);
    candidate.reasons.add(boost.reason);
  }
}

function tokenCoverage(path: string, tokens: string[]) {
  const normalizedPath = path.toLowerCase();
  if (tokens.length === 0) return 0;
  const matchedCount = tokens.filter((token) => normalizedPath.includes(token)).length;
  return matchedCount / tokens.length;
}

function relevantSymbolTokenCoverage(candidate: Candidate, tokens: string[]) {
  if (tokens.length === 0 || candidate.relevantSymbols.size === 0) return 0;

  let maxMatchedCount = 0;
  for (const symbol of Array.from(candidate.relevantSymbols.values())) {
    const symbolTokens = new Set(tokenize(symbol.name));
    const matchedCount = tokens.filter((token) => symbolTokens.has(token)).length;
    maxMatchedCount = Math.max(maxMatchedCount, matchedCount);
  }

  return maxMatchedCount / tokens.length;
}

function applyBroadMatchCaps(candidate: Candidate, tokens: string[]) {
  const hasDirectSymbolEvidence =
    candidate.signals.has("symbol_match") || candidate.signals.has("export_match");
  const hasCoreConvention =
    candidate.signals.has("convention:next_page") ||
    candidate.signals.has("convention:controller") ||
    candidate.signals.has("convention:service") ||
    candidate.signals.has("convention:schema");
  const hasOnlyBroadPathEvidence =
    candidate.signals.has("file_path_match") &&
    !hasDirectSymbolEvidence &&
    tokenCoverage(candidate.path, tokens) <= 0.35;
  const symbolCoverage = relevantSymbolTokenCoverage(candidate, tokens);

  if (hasOnlyBroadPathEvidence && candidate.signals.has("convention:mcp_tool")) {
    candidate.score = Math.min(candidate.score, 70);
    candidate.signals.add("broad_path_match");
    candidate.reasons.add("broad path-only match");
  }

  if (candidate.signals.has("graph_neighbor") && !hasDirectSymbolEvidence) {
    candidate.score = Math.min(candidate.score, 68);
  }

  if (
    hasDirectSymbolEvidence &&
    !hasCoreConvention &&
    Math.max(tokenCoverage(candidate.path, tokens), symbolCoverage) <= 0.2
  ) {
    candidate.score = Math.min(candidate.score, 78);
    candidate.signals.add("weak_direct_match");
    candidate.reasons.add("weak direct match");
  }

  if (hasDirectSymbolEvidence && symbolCoverage >= 0.3) {
    candidate.score += 12;
    candidate.signals.add("domain_symbol_match");
    candidate.reasons.add("symbol name covers task domain terms");
  }
}

function addSignalScore(
  candidate: Candidate,
  signal: string,
  firstScore: number,
  repeatScore: number,
) {
  const seen = candidate.signals.has(signal);
  candidate.signals.add(signal);
  candidate.score += seen ? repeatScore : firstScore;
  return !seen;
}

function buildSuggestedNextTools(candidate: Candidate): ProjectEditLocationNextTool[] {
  const tools: ProjectEditLocationNextTool[] = ["get_file"];

  if (candidate.relevantSymbols.size > 0) {
    tools.push("find_usages", "find_callers");
  }

  if (candidate.signals.has("graph_neighbor")) {
    tools.push("get_project_map");
  }

  return Array.from(new Set(tools));
}

const SMALL_FILE_LINE_THRESHOLD = 150;

function buildReadPlan(candidate: Candidate): ProjectEditLocationReadPlan {
  const symbolNames = Array.from(candidate.relevantSymbols.values())
    .slice(0, 5)
    .map((s) => s.name);

  if (symbolNames.length > 0) {
    return { include: ["symbols"], symbolNames };
  }

  const lineCount = candidate.lineCount;
  if (lineCount !== null && lineCount <= SMALL_FILE_LINE_THRESHOLD) {
    return { include: ["content"] };
  }

  return { include: ["outline"] };
}

function buildReason(candidate: Candidate) {
  const reasons = Array.from(candidate.reasons).slice(0, 3);
  if (reasons.length > 0) {
    return reasons.join(" · ");
  }

  if (candidate.signals.has("graph_neighbor")) {
    return "near a high-confidence match in the import graph";
  }

  return "matched task terms in indexed code map";
}

export function buildEditLocationSuggestions(input: {
  query: string;
  searchResults: ProjectMapSearchResponse;
  fileRecords: EditLocationFileRecord[];
  graphEdges: EditLocationGraphEdge[];
  limit: number;
}): ProjectEditLocationSuggestion[] {
  const tokens = tokenize(input.query);
  const fileByPath = new Map(input.fileRecords.map((file) => [file.path, file]));
  const candidates = new Map<string, Candidate>();

  for (const file of input.searchResults.files) {
    const record = fileByPath.get(file.path);
    const candidate = getOrCreateCandidate(candidates, {
      id: record?.id ?? null,
      path: file.path,
      language: file.language,
      lineCount: record?.lineCount ?? null,
    });
    if (addSignalScore(candidate, "file_path_match", 32, 6)) {
      candidate.score += pathTokenScore(file.path, tokens);
    }
    candidate.reasons.add("file path matches task terms");
  }

  for (const symbol of input.searchResults.symbols) {
    const record = fileByPath.get(symbol.filePath);
    const candidate = getOrCreateCandidate(candidates, {
      id: record?.id ?? null,
      path: symbol.filePath,
      language: record?.language ?? null,
      lineCount: record?.lineCount ?? null,
    });
    if (addSignalScore(candidate, "symbol_match", 62, 8)) {
      candidate.score += pathTokenScore(symbol.filePath, tokens);
    }
    candidate.score += nameTokenScore(symbol.displayName, tokens);
    candidate.reasons.add(`symbol match: ${symbol.displayName}`);
    addRelevantSymbol(candidate, symbol);
    applyGenericSymbolDemotion(candidate, symbol.displayName, tokens);
  }

  for (const exportResult of input.searchResults.exports) {
    const record = fileByPath.get(exportResult.filePath);
    const candidate = getOrCreateCandidate(candidates, {
      id: record?.id ?? null,
      path: exportResult.filePath,
      language: record?.language ?? null,
      lineCount: record?.lineCount ?? null,
    });
    if (addSignalScore(candidate, "export_match", 50, 6)) {
      candidate.score += pathTokenScore(exportResult.filePath, tokens);
    }
    candidate.score += nameTokenScore(exportResult.exportName, tokens);
    candidate.reasons.add(`export match: ${exportResult.exportName}`);
    addRelevantSymbol(candidate, exportResult);
    applyGenericSymbolDemotion(candidate, exportResult.exportName, tokens);
  }

  for (const candidate of Array.from(candidates.values())) {
    applyConventionBoosts(candidate);
  }

  const seedFileIds = new Set(
    Array.from(candidates.values())
      .filter((candidate) => candidate.id && candidate.score >= 50)
      .map((candidate) => candidate.id as string),
  );

  for (const edge of input.graphEdges) {
    for (const file of [edge.sourceFile, edge.targetFile]) {
      if (!file || seedFileIds.has(file.id)) continue;

      const candidate = getOrCreateCandidate(candidates, {
        id: file.id,
        path: file.path,
        language: file.language,
      });
      if (addSignalScore(candidate, "graph_neighbor", 24, 0)) {
        candidate.score += Math.min(pathTokenScore(file.path, tokens), 18);
      }
      candidate.reasons.add("near a high-confidence match in import graph");
      applyConventionBoosts(candidate);
    }
  }

  for (const candidate of Array.from(candidates.values())) {
    applyBroadMatchCaps(candidate, tokens);
  }

  return Array.from(candidates.values())
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.path.localeCompare(right.path);
    })
    .slice(0, input.limit)
    .map((candidate) => ({
      path: candidate.path,
      language: candidate.language,
      confidence: getConfidence(candidate),
      score: Math.round(candidate.score),
      reason: buildReason(candidate),
      signals: [
        ...Array.from(candidate.signals),
        ...Array.from(candidate.demotedSignals).map((signal) => `demoted:${signal}`),
      ].sort(),
      relevantSymbols: Array.from(candidate.relevantSymbols.values()).slice(0, 8),
      suggestedNextTools: buildSuggestedNextTools(candidate),
      readPlan: buildReadPlan(candidate),
    }));
}

export function createEditLocationsService(database: Database) {
  const searchService = createSearchService(database);

  return {
    async suggestEditLocations(input: {
      projectId: string;
      projectImportId: string;
      query: string;
      limit: number;
    }): Promise<ProjectEditLocationsResponse> {
      const query = input.query.trim();
      const tokens = tokenize(query);

      if (tokens.length === 0) {
        return {
          query,
          projectId: input.projectId,
          importId: input.projectImportId,
          suggestions: [],
          meta: {
            source: "deterministic_search_and_graph",
            staleness: "latest_import",
          },
        };
      }

      const searchResults = await searchService.searchProjectMap(
        input.projectImportId,
        query,
      );

      const matchedPaths = Array.from(
        new Set([
          ...searchResults.files.map((file) => file.path),
          ...searchResults.symbols.map((symbol) => symbol.filePath),
          ...searchResults.exports.map((item) => item.filePath),
        ]),
      ).filter(Boolean);

      const fileRecords =
        matchedPaths.length > 0
          ? await database.query.repoFile.findMany({
              where: and(
                eq(repoFile.projectImportId, input.projectImportId),
                inArray(repoFile.path, matchedPaths),
              ),
              columns: {
                id: true,
                path: true,
                language: true,
                lineCount: true,
              },
            })
          : [];
      const seedFileIds = Array.from(
        new Set(
          fileRecords
            .filter((file) => matchedPaths.includes(file.path))
            .map((file) => file.id),
        ),
      );

      let graphEdges: EditLocationGraphEdge[] = [];
      if (seedFileIds.length > 0) {
        graphEdges = await database.query.repoImportEdge.findMany({
          where: and(
            eq(repoImportEdge.projectImportId, input.projectImportId),
            eq(repoImportEdge.isResolved, true),
            or(
              inArray(repoImportEdge.sourceFileId, seedFileIds),
              inArray(repoImportEdge.targetFileId, seedFileIds),
            ),
          ),
          with: {
            sourceFile: true,
            targetFile: true,
          },
          limit: 200,
        });
      }

      const suggestions = buildEditLocationSuggestions({
        query,
        searchResults,
        fileRecords,
        graphEdges,
        limit: input.limit,
      });

      return {
        query,
        projectId: input.projectId,
        importId: input.projectImportId,
        suggestions,
        meta: {
          source: "deterministic_search_and_graph",
          staleness: "latest_import",
        },
      };
    },
  };
}
