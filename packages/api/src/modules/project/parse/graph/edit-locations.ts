import { and, eq, inArray, or } from "drizzle-orm";
import { repoFile, repoImportEdge } from "../../../../db/schema";
import type {
  ProjectEditLocationNextTool,
  ProjectEditLocationSuggestion,
  ProjectEditLocationsResponse,
  ProjectMapSearchExportResult,
  ProjectMapSearchSymbolResult,
} from "../types/repo-parse-graph.types";
import { createSearchService } from "./search";

type Database = typeof import("../../../../db/index.ts").db;

interface Candidate {
  id: string | null;
  path: string;
  language: string | null;
  score: number;
  signals: Set<string>;
  reasons: Set<string>;
  relevantSymbols: Map<string, ProjectEditLocationSuggestion["relevantSymbols"][number]>;
}

const STOP_WORDS = new Set([
  "add",
  "and",
  "are",
  "cho",
  "code",
  "cua",
  "for",
  "from",
  "into",
  "lam",
  "new",
  "the",
  "this",
  "tool",
  "tools",
  "v1",
  "vao",
  "with",
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
    score: 12,
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
    score: 9,
    signal: "convention:schema",
    reason: "request/response schema convention",
  },
  {
    pattern: /(^|\/)tools\//,
    score: 12,
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

function getConfidence(score: number) {
  if (score >= 80) return "high" as const;
  if (score >= 45) return "medium" as const;
  return "low" as const;
}

function getOrCreateCandidate(
  candidates: Map<string, Candidate>,
  input: {
    id?: string | null;
    path: string;
    language?: string | null;
  },
) {
  const existing = candidates.get(input.path);
  if (existing) {
    if (!existing.id && input.id) existing.id = input.id;
    if (!existing.language && input.language) existing.language = input.language;
    return existing;
  }

  const candidate: Candidate = {
    id: input.id ?? null,
    path: input.path,
    language: input.language ?? null,
    score: 0,
    signals: new Set(),
    reasons: new Set(),
    relevantSymbols: new Map(),
  };
  candidates.set(input.path, candidate);
  return candidate;
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
  for (const boost of CONVENTION_BOOSTS) {
    if (!boost.pattern.test(candidate.path)) continue;
    candidate.score += boost.score;
    candidate.signals.add(boost.signal);
    candidate.reasons.add(boost.reason);
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
              },
            })
          : [];
      const fileByPath = new Map(fileRecords.map((file) => [file.path, file]));
      const candidates = new Map<string, Candidate>();

      for (const file of searchResults.files) {
        const record = fileByPath.get(file.path);
        const candidate = getOrCreateCandidate(candidates, {
          id: record?.id ?? null,
          path: file.path,
          language: file.language,
        });
        if (addSignalScore(candidate, "file_path_match", 50, 8)) {
          candidate.score += pathTokenScore(file.path, tokens);
        }
        candidate.reasons.add("file path matches task terms");
      }

      for (const symbol of searchResults.symbols) {
        const record = fileByPath.get(symbol.filePath);
        const candidate = getOrCreateCandidate(candidates, {
          id: record?.id ?? null,
          path: symbol.filePath,
          language: record?.language ?? null,
        });
        if (addSignalScore(candidate, "symbol_match", 65, 12)) {
          candidate.score += pathTokenScore(symbol.filePath, tokens);
        }
        candidate.reasons.add(`symbol match: ${symbol.displayName}`);
        addRelevantSymbol(candidate, symbol);
      }

      for (const exportResult of searchResults.exports) {
        const record = fileByPath.get(exportResult.filePath);
        const candidate = getOrCreateCandidate(candidates, {
          id: record?.id ?? null,
          path: exportResult.filePath,
          language: record?.language ?? null,
        });
        if (addSignalScore(candidate, "export_match", 50, 10)) {
          candidate.score += pathTokenScore(exportResult.filePath, tokens);
        }
        candidate.reasons.add(`export match: ${exportResult.exportName}`);
        addRelevantSymbol(candidate, exportResult);
      }

      for (const candidate of candidates.values()) {
        candidate.score += pathTokenScore(candidate.path, tokens);
        applyConventionBoosts(candidate);
      }

      const seedFileIds = Array.from(
        new Set(
          Array.from(candidates.values())
            .filter((candidate) => candidate.id && candidate.score >= 50)
            .map((candidate) => candidate.id as string),
        ),
      );

      if (seedFileIds.length > 0) {
        const edges = await database.query.repoImportEdge.findMany({
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

        for (const edge of edges) {
          for (const file of [edge.sourceFile, edge.targetFile]) {
            if (!file || seedFileIds.includes(file.id)) continue;

            const candidate = getOrCreateCandidate(candidates, {
              id: file.id,
              path: file.path,
              language: file.language,
            });
            if (addSignalScore(candidate, "graph_neighbor", 22, 0)) {
              candidate.score += pathTokenScore(file.path, tokens);
            }
            candidate.reasons.add("near a high-confidence match in import graph");
            applyConventionBoosts(candidate);
          }
        }
      }

      const suggestions = Array.from(candidates.values())
        .sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return left.path.localeCompare(right.path);
        })
        .slice(0, input.limit)
        .map((candidate) => ({
          path: candidate.path,
          language: candidate.language,
          confidence: getConfidence(candidate.score),
          score: Math.round(candidate.score),
          reason: buildReason(candidate),
          signals: Array.from(candidate.signals).sort(),
          relevantSymbols: Array.from(candidate.relevantSymbols.values()).slice(0, 8),
          suggestedNextTools: buildSuggestedNextTools(candidate),
        }));

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
