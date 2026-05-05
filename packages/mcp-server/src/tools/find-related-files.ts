import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import type { CodebaseSearchResponse } from "../lib/api-types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileRelationship {
  imports: Array<{ targetPath: string | null }>;
  importedBy: Array<{ sourcePath: string }>;
}

interface SignalSet {
  directImport: number;
  reverseImport: number;
  symbolUsage: number;
  sameFeature: number;
  filenameSimilarity: number;
  importExpansion: number;
  searchRelevance: number;
  sameFolder: number;
}

interface ScoredFile {
  path: string;
  score: number;
  signals: Partial<SignalSet>;
  reasons: string[];
  symbols?: string[];
}

interface ResultGroup {
  label: string;
  description: string;
  files: ScoredFile[];
}

// ── Weights ───────────────────────────────────────────────────────────────────

const WEIGHTS: SignalSet = {
  directImport: 1.0,
  reverseImport: 0.9,
  symbolUsage: 0.7,
  sameFeature: 0.5,
  filenameSimilarity: 0.45,
  importExpansion: 0.4,
  searchRelevance: 0.35,
  sameFolder: 0.3,
};

// ── Keyword helpers ───────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "sửa", "thêm", "xóa", "cập", "nhật", "tạo", "làm", "cho", "với",
  "fix", "add", "remove", "delete", "update", "create", "change",
  "the", "a", "an", "for", "with", "in", "on", "to", "of",
  "bug", "lỗi", "issue", "error", "feature", "page", "file",
]);

function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s\-_/.,]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// ── Path / domain helpers ─────────────────────────────────────────────────────

const STRUCTURAL_SEGMENTS = new Set([
  "src", "features", "modules", "routes", "components", "api", "lib",
  "utils", "hooks", "test", "types", "plugins", "workers", "app",
  "packages", "web", "mcp-server", "(auth)", "(protected)", "index",
  "page", "layout", "loading", "error", "shared", "common",
]);

function extractDomains(filePath: string): string[] {
  return filePath
    .split("/")
    .map((p) =>
      p
        .replace(/^\d+\./, "")
        .replace(/\.(ts|tsx|js|jsx|dart|php|py)$/, "")
        .toLowerCase(),
    )
    .filter(
      (p) =>
        p.length > 2 &&
        !STRUCTURAL_SEGMENTS.has(p) &&
        !/^\[.*\]$/.test(p),
    );
}

function computeSameFeatureScore(pathA: string, pathB: string): number {
  const domainsA = new Set(extractDomains(pathA));
  const domainsB = new Set(extractDomains(pathB));
  const shared = [...domainsA].filter((d) => domainsB.has(d));
  return shared.length > 0 ? 1.0 : 0;
}

function computeSameFolderScore(pathA: string, pathB: string): number {
  const folderA = pathA.split("/").slice(0, -1).join("/");
  const folderB = pathB.split("/").slice(0, -1).join("/");
  if (folderA === folderB) return 1.0;
  if (folderA.startsWith(folderB + "/") || folderB.startsWith(folderA + "/"))
    return 0.5;
  return 0;
}

function computeFilenameSimilarityScore(
  filePath: string,
  keywords: string[],
): number {
  if (keywords.length === 0) return 0;
  const filename = filePath.split("/").pop()?.toLowerCase() ?? "";
  const matches = keywords.filter((kw) => filename.includes(kw));
  return matches.length / keywords.length;
}

function keywordsMatchPath(filePath: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const domains = extractDomains(filePath);
  return keywords.some((kw) =>
    domains.some((d) => d.includes(kw) || kw.includes(d)),
  );
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function computeScore(sig: Partial<SignalSet>): number {
  let total = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    total += (sig[key as keyof SignalSet] ?? 0) * weight;
  }
  return total;
}

function buildReasons(sig: Partial<SignalSet>): string[] {
  const reasons: string[] = [];
  if (sig.directImport) reasons.push("directly imported");
  if (sig.reverseImport) reasons.push("imports anchor file");
  if ((sig.symbolUsage ?? 0) > 0.5) reasons.push("top symbol match");
  if ((sig.searchRelevance ?? 0) > 0.5) reasons.push("keyword match");
  if (sig.sameFeature) reasons.push("same feature domain");
  if ((sig.filenameSimilarity ?? 0) > 0.3) reasons.push("filename matches query");
  if (sig.sameFolder) reasons.push("same folder");
  if (sig.importExpansion) reasons.push("2nd-hop import");
  return reasons.length > 0 ? reasons : ["related via import graph"];
}

function getPrimaryGroup(result: ScoredFile): string {
  if (result.signals.directImport || result.signals.reverseImport) {
    return "Direct graph";
  }
  if ((result.signals.symbolUsage ?? 0) > 0 || (result.signals.searchRelevance ?? 0) > 0) {
    return "Search and symbol matches";
  }
  if (result.signals.sameFeature || result.signals.sameFolder) {
    return "Same feature or folder";
  }
  return "Expanded graph";
}

function groupResults(results: ScoredFile[]): ResultGroup[] {
  const groups: ResultGroup[] = [
    {
      label: "Direct graph",
      description: "Files that directly import the anchor or are directly imported by it.",
      files: [],
    },
    {
      label: "Search and symbol matches",
      description: "Files surfaced by keyword, filename, or symbol matches.",
      files: [],
    },
    {
      label: "Same feature or folder",
      description: "Files that share feature-domain or folder signals with the query/anchor.",
      files: [],
    },
    {
      label: "Expanded graph",
      description: "Second-hop or weaker graph/context matches.",
      files: [],
    },
  ];

  const byLabel = new Map(groups.map((group) => [group.label, group]));
  for (const result of results) {
    byLabel.get(getPrimaryGroup(result))?.files.push(result);
  }

  return groups.filter((group) => group.files.length > 0);
}

function formatGetFilesCall(results: ScoredFile[]) {
  const paths = results.slice(0, 7).map((result) => result.path);
  return `get_files(${JSON.stringify(paths)})`;
}

// ── Output ────────────────────────────────────────────────────────────────────

function buildOutput(
  query: string | undefined,
  anchorPath: string | undefined,
  results: ScoredFile[],
  groups: ResultGroup[],
): string {
  const label = query
    ? `"${query}"`
    : anchorPath
      ? `\`${anchorPath}\``
      : "query";
  const lines = [`## Related files for ${label}`, ""];

  if (results.length === 0) {
    lines.push(
      "No related files found. Try a broader query or check that the project is indexed.",
    );
    return lines.join("\n");
  }

  lines.push("### Recommended read order");
  results.slice(0, 7).forEach((f, i) => {
    const symbols = f.symbols?.length
      ? ` · symbols: ${f.symbols.slice(0, 3).join(", ")}`
      : "";
    lines.push(`${i + 1}. ${f.path}  score=${f.score.toFixed(2)} · ${f.reasons.join(", ")}${symbols}`);
  });
  lines.push("");
  lines.push("### Next tool calls");
  lines.push(`→ ${formatGetFilesCall(results)}  // survey outlines for the top candidates`);
  if (results[0]?.symbols?.[0]) {
    lines.push(
      `→ get_symbol_context(symbol_name="${results[0].symbols[0]}", file_path="${results[0].path}")  // read only the top matched symbol`,
    );
  } else {
    lines.push(`→ get_file("${results[0]!.path}", include=["outline"])  // deep-dive the top candidate`);
  }
  lines.push("");

  for (const group of groups) {
    lines.push(`### ${group.label}`);
    lines.push(group.description);
    group.files.forEach((f) => {
      lines.push(`- **${f.path}**  score=${f.score.toFixed(2)}`);
      lines.push(`  Signals: ${f.reasons.join(", ")}`);
    });
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerFindRelatedFilesTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "find_related_files",
    {
      title: "Find Related Files",
      description:
        "Use this for questions like 'which files should I read?', 'what files are related?', or 'what is the scope around this file/symbol?'. " +
        "Find files related to a query, file, or symbol using multi-signal ranking. " +
        "Scores candidates by: direct imports (1.0), reverse imports (0.9), symbol usage (0.7), " +
        "same feature domain (0.5), filename similarity (0.45), 2nd-hop imports (0.4), " +
        "search relevance (0.35), same folder (0.3). " +
        "Accepts natural-language queries (e.g. 'login bug', 'add pagination') or a file path as anchor. " +
        "After results, use get_files to survey outlines before reading content. " +
        "project_id is optional if workspace is linked.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(300)
          .optional()
          .describe(
            "Natural-language query like 'login bug' or 'add pagination'. " +
              "Finds related files via keyword search + graph expansion.",
          ),
        file_path: z
          .string()
          .optional()
          .describe(
            "Anchor file path. Expands outward via import graph. Can be combined with query.",
          ),
        symbol_name: z
          .string()
          .optional()
          .describe(
            "Symbol name to anchor on. Resolves to its definition file then expands via import graph.",
          ),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .default(10)
          .describe("Maximum results to return. Default: 10."),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "CodeMap project UUID. Auto-resolved from workspace if omitted.",
          ),
      },
    },
    withToolError(
      async ({ query, file_path, symbol_name, max_results, project_id }) => {
        const client = createCodeMapClient(config);
        const resolvedProjectId =
          project_id ?? (await readWorkspaceProjectId());

        if (!resolvedProjectId) {
          return success(
            "No project linked. Run link_project or get_project first.",
            { projectId: null, query, file_path, relatedFiles: [] },
          );
        }

        if (!query && !file_path && !symbol_name) {
          return success(
            "Provide at least one of: query, file_path, or symbol_name.",
            { projectId: resolvedProjectId, relatedFiles: [] },
          );
        }

        const sigMap = new Map<string, Partial<SignalSet>>();
        const symbolMap = new Map<string, Set<string>>();
        const keywords = query ? extractKeywords(query) : [];

        const addSignal = (path: string, update: Partial<SignalSet>) => {
          if (!path || path.includes("node_modules")) return;
          const existing = sigMap.get(path) ?? {};
          const merged: Partial<SignalSet> = { ...existing };
          for (const [k, v] of Object.entries(update)) {
            const key = k as keyof SignalSet;
            merged[key] = Math.max(existing[key] ?? 0, v as number);
          }
          sigMap.set(path, merged);
        };
        const addSymbol = (path: string, symbolName: string) => {
          const symbols = symbolMap.get(path) ?? new Set<string>();
          symbols.add(symbolName);
          symbolMap.set(path, symbols);
        };

        // ── Phase 1: resolve anchor file from symbol ─────────────────────────

        let anchorPath = file_path;

        if (symbol_name && !anchorPath) {
          const result = await client
            .request<CodebaseSearchResponse>(
              `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
              { authRequired: true, query: { q: symbol_name, kinds: "symbols" } },
            )
            .catch(() => null);
          if (result?.symbols.length) {
            anchorPath = result.symbols[0].filePath;
          }
        }

        // ── Phase 2: parallel — keyword search + anchor import graph ─────────

        await Promise.all([
          query
            ? client
                .request<CodebaseSearchResponse>(
                  `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
                  { authRequired: true, query: { q: query } },
                )
                .then((results) => {
                  results.files.slice(0, 12).forEach((f, i) => {
                    addSignal(f.path, { searchRelevance: 1 / (i + 1) });
                    const sim = computeFilenameSimilarityScore(f.path, keywords);
                    if (sim > 0) addSignal(f.path, { filenameSimilarity: sim });
                  });
                  results.symbols.slice(0, 12).forEach((s, i) => {
                    addSignal(s.filePath, { symbolUsage: 1 / (i + 1) });
                    addSymbol(s.filePath, s.displayName);
                    const sim = computeFilenameSimilarityScore(s.filePath, keywords);
                    if (sim > 0) addSignal(s.filePath, { filenameSimilarity: sim });
                  });
                })
                .catch(() => {})
            : Promise.resolve(),

          anchorPath
            ? client
                .request<{ file: FileRelationship }>(
                  `/projects/${encodeURIComponent(resolvedProjectId)}/map/files`,
                  { authRequired: true, query: { path: anchorPath } },
                )
                .then(({ file }) => {
                  file.imports?.forEach((imp) => {
                    if (imp.targetPath)
                      addSignal(imp.targetPath, { directImport: 1 });
                  });
                  file.importedBy?.forEach((imp) => {
                    addSignal(imp.sourcePath, { reverseImport: 1 });
                  });
                })
                .catch(() => {})
            : Promise.resolve(),
        ]);

        // ── Phase 3: 2nd-hop expansion from top query results ────────────────

        if (query && sigMap.size > 0) {
          const topPaths = [...sigMap.entries()]
            .sort((a, b) => computeScore(b[1]) - computeScore(a[1]))
            .slice(0, 3)
            .map(([path]) => path)
            .filter((p) => p !== anchorPath);

          await Promise.all(
            topPaths.map((path) =>
              client
                .request<{ file: FileRelationship }>(
                  `/projects/${encodeURIComponent(resolvedProjectId)}/map/files`,
                  { authRequired: true, query: { path } },
                )
                .then(({ file }) => {
                  file.imports?.forEach((imp) => {
                    if (imp.targetPath && !sigMap.has(imp.targetPath))
                      addSignal(imp.targetPath, { importExpansion: 1 });
                  });
                  file.importedBy?.forEach((imp) => {
                    if (!sigMap.has(imp.sourcePath))
                      addSignal(imp.sourcePath, { importExpansion: 1 });
                  });
                })
                .catch(() => {}),
            ),
          );
        }

        // ── Phase 4: path-based signals for all candidates ───────────────────

        for (const [path, current] of sigMap) {
          if (keywords.length > 0 && !current.filenameSimilarity) {
            const sim = computeFilenameSimilarityScore(path, keywords);
            if (sim > 0) addSignal(path, { filenameSimilarity: sim });
          }
          if (anchorPath) {
            if (!current.sameFolder) {
              const fs = computeSameFolderScore(path, anchorPath);
              if (fs > 0) addSignal(path, { sameFolder: fs });
            }
            if (!current.sameFeature) {
              const fts = computeSameFeatureScore(path, anchorPath);
              if (fts > 0) addSignal(path, { sameFeature: fts });
            }
          }
          if (keywords.length > 0 && !current.sameFeature) {
            if (keywordsMatchPath(path, keywords))
              addSignal(path, { sameFeature: 0.6 });
          }
        }

        // ── Phase 5: rank and return ─────────────────────────────────────────

        const results: ScoredFile[] = [...sigMap.entries()]
          .filter(([path]) => path !== anchorPath)
          .map(([path, sig]) => ({
            path,
            score: computeScore(sig),
            signals: sig,
            reasons: buildReasons(sig),
            symbols: [...(symbolMap.get(path) ?? [])],
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, max_results ?? 10);
        const groups = groupResults(results);
        const recommendedReads = results.slice(0, 7).map((result, index) => ({
          path: result.path,
          priority: index + 1,
          score: result.score,
          reasons: result.reasons,
          symbols: result.symbols ?? [],
          readPlan: result.symbols?.[0]
            ? {
                tool: "get_symbol_context",
                symbolName: result.symbols[0],
                filePath: result.path,
              }
            : { include: ["outline"] as const },
        }));

        const suggestedNextTools: string[] = results.length > 0
          ? [
              formatGetFilesCall(results),
              results[0]?.symbols?.[0]
                ? `get_symbol_context(symbol_name="${results[0].symbols[0]}", file_path="${results[0].path}")`
                : `get_file("${results[0]!.path}", include=["outline"])`,
            ]
          : [];
        if (results.length === 0) {
          suggestedNextTools.push("get_project_map()  // browse structure manually");
        }

        return success(buildOutput(query, anchorPath, results, groups), {
          projectId: resolvedProjectId,
          query,
          anchor: {
            filePath: anchorPath ?? null,
            symbolName: symbol_name ?? null,
          },
          anchorFile: anchorPath,
          relatedFiles: results.map((r) => ({
            path: r.path,
            score: r.score,
            reasons: r.reasons,
            signals: r.signals,
            symbols: r.symbols ?? [],
          })),
          resultGroups: groups.map((group) => ({
            label: group.label,
            description: group.description,
            files: group.files.map((file) => file.path),
          })),
          recommendedReads,
          total: results.length,
          nextAction: results.length > 0 ? "get_files" : "get_project_map",
          suggestedNextTools,
        });
      },
    ),
  );
}
