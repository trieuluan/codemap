import { z } from "zod";
import { uuidSchema } from "../lib/uuid-schema.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient, type CodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type {
  CodebaseSearchResponse,
  SearchExportResult,
  SearchFileResult,
  SearchSymbolResult,
  SemanticSearchResult,
} from "../lib/api-types.js";
import {
  ensureLocalIndexWithSummary,
  shouldFallbackToLocal,
  shouldUseLocalIndexBeforeRemote,
} from "../lib/local-index.js";

type Layer =
  | "Frontend routes"
  | "Frontend components"
  | "Frontend API clients"
  | "Backend routes"
  | "Backend services"
  | "Database and shared types"
  | "MCP/tools"
  | "Tests and docs"
  | "Other";

interface FeatureFile {
  path: string;
  layer: Layer;
  score: number;
  reasons: string[];
  symbols: string[];
}

interface ParsedFileSummary {
  imports?: Array<{ targetPath?: string | null; targetPathText?: string | null }>;
  importedBy?: Array<{ sourceFilePath?: string | null; sourcePath?: string | null }>;
}

type Confidence = "high" | "medium" | "low";

const LAYERS: Layer[] = [
  "Frontend routes",
  "Frontend components",
  "Frontend API clients",
  "Backend routes",
  "Backend services",
  "Database and shared types",
  "MCP/tools",
  "Tests and docs",
  "Other",
];

const STOP_WORDS = new Set([
  "sua",
  "them",
  "xoa",
  "cap",
  "nhat",
  "tao",
  "lam",
  "cho",
  "voi",
  "fix",
  "add",
  "remove",
  "delete",
  "update",
  "create",
  "change",
  "bug",
  "loi",
  "issue",
  "error",
  "feature",
  "page",
  "file",
  "the",
  "and",
  "for",
  "with",
  "into",
  "from",
  "cua",
  "trong",
]);

const STRUCTURAL_SEGMENTS = new Set([
  "src",
  "app",
  "features",
  "modules",
  "routes",
  "components",
  "api",
  "lib",
  "utils",
  "hooks",
  "types",
  "shared",
  "common",
  "packages",
  "web",
  "mcp-server",
  "index",
  "page",
  "layout",
  "loading",
  "error",
  "route",
  "(auth)",
  "(protected)",
]);

function classifyLayer(path: string): Layer {
  if (/\.(test|spec)\./.test(path) || path.includes("/__tests__/")) return "Tests and docs";
  if (/\.(md|mdx)$/.test(path) || path.includes("/docs/")) return "Tests and docs";
  if (path.includes("packages/mcp-server/")) return "MCP/tools";
  if (path.includes("packages/web/app/")) return "Frontend routes";
  if (path.includes("packages/web/features/") && path.endsWith("/api.ts")) {
    return "Frontend API clients";
  }
  if (path.includes("packages/web/") && path.includes("/api/")) {
    return "Frontend API clients";
  }
  if (path.includes("packages/web/")) return "Frontend components";
  if (path.includes("packages/api/src/routes/")) return "Backend routes";
  if (path.includes("packages/api/src/modules/")) return "Backend services";
  if (
    path.includes("packages/api/src/db/") ||
    path.includes("packages/shared/src/")
  ) {
    return "Database and shared types";
  }
  return "Other";
}

function normalizeQuery(query: string) {
  return query
    .toLowerCase()
    .split(/[\s\-_/.,:]+/)
    .map((word) =>
      word
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, ""),
    )
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function filename(path: string) {
  return path.split("/").pop()?.toLowerCase() ?? "";
}

function pathSegments(path: string) {
  return path
    .split("/")
    .map((segment) =>
      segment
        .replace(/^\d+\./, "")
        .replace(/\.(ts|tsx|js|jsx|dart|php|py|md|mdx)$/, "")
        .toLowerCase(),
    )
    .filter(Boolean);
}

function extractDomains(path: string) {
  return pathSegments(path).filter(
    (segment) =>
      segment.length > 2 &&
      !STRUCTURAL_SEGMENTS.has(segment) &&
      !/^\[.*\]$/.test(segment),
  );
}

function symbolScore(name: string | undefined, keywords: string[]) {
  if (!name) return 0;
  const lower = name.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (lower === keyword) score += 2.4;
    else if (lower.includes(keyword)) score += 1.1;
  }
  return score;
}

function hasQuerySignal(pathSignal: ReturnType<typeof pathScore>, nameSignal: number) {
  return nameSignal > 0 || pathSignal.score > 0;
}

function searchOnlyScore(baseScore: number, pathSignal: ReturnType<typeof pathScore>, nameSignal: number) {
  if (hasQuerySignal(pathSignal, nameSignal)) {
    return baseScore + pathSignal.score + nameSignal;
  }
  return Math.min(baseScore, 0.35);
}

function layerPriority(layer: Layer, keywords: string[]) {
  const wantsMcp = keywords.some((keyword) => ["mcp", "tool", "tools"].includes(keyword));
  switch (layer) {
    case "Frontend routes":
      return 1.4;
    case "Backend routes":
      return 1.25;
    case "Backend services":
      return 1.1;
    case "Frontend API clients":
      return 1;
    case "Database and shared types":
      return 0.85;
    case "Frontend components":
      return 0.75;
    case "MCP/tools":
      return wantsMcp ? 1.2 : -0.35;
    case "Tests and docs":
      return -0.25;
    case "Other":
      return 0;
  }
}

function pathScore(path: string, keywords: string[]) {
  const lower = path.toLowerCase();
  const segments = pathSegments(path);
  const domains = extractDomains(path);
  let score = 0;
  const reasons: string[] = [];

  for (const keyword of keywords) {
    if (segments.includes(keyword)) {
      score += 2.2;
      reasons.push("exact feature segment");
    } else if (domains.some((domain) => domain.includes(keyword) || keyword.includes(domain))) {
      score += 1.3;
      reasons.push("feature domain match");
    } else if (lower.includes(keyword)) {
      score += 0.7;
      reasons.push("path keyword match");
    }
    if (filename(path).includes(keyword)) {
      score += 0.8;
      reasons.push("filename match");
    }
  }

  if (path.endsWith("/page.tsx") || path.endsWith("/route.ts")) {
    score += 0.7;
    reasons.push("entrypoint file");
  }
  if (path.endsWith("/api.ts")) {
    score += 0.6;
    reasons.push("api client");
  }
  if (path.endsWith("loading.tsx") || path.endsWith("error.tsx")) {
    score -= 1.4;
    reasons.push("low-signal shell file");
  }
  if (lower.includes("/components/ui/") || lower.includes("/ui/")) {
    score -= 0.7;
    reasons.push("generic ui component");
  }
  if (path.includes("/node_modules/")) score -= 10;
  return {
    score,
    reasons: [...new Set(reasons)],
  };
}

function addFile(
  files: Map<string, FeatureFile>,
  path: string,
  score: number,
  reason: string,
  symbolName?: string,
) {
  const current =
    files.get(path) ??
    ({
      path,
      layer: classifyLayer(path),
      score: 0,
      reasons: [],
      symbols: [],
    } satisfies FeatureFile);

  current.score += score;
  if (!current.reasons.includes(reason)) current.reasons.push(reason);
  if (symbolName && !current.symbols.includes(symbolName)) {
    current.symbols.push(symbolName);
  }
  files.set(path, current);
}

function buildFiles(
  results: CodebaseSearchResponse,
  keywords: string[],
): FeatureFile[] {
  const files = new Map<string, FeatureFile>();

  results.files.forEach((file: SearchFileResult, index) => {
    const pathSignal = pathScore(file.path, keywords);
    const layer = classifyLayer(file.path);
    addFile(
      files,
      file.path,
      3 - index * 0.08 + pathSignal.score + layerPriority(layer, keywords),
      "file match",
    );
    for (const reason of pathSignal.reasons) {
      addFile(files, file.path, 0, reason);
    }
  });

  results.symbols.forEach((symbol: SearchSymbolResult, index) => {
    const pathSignal = pathScore(symbol.filePath, keywords);
    const nameSignal = symbolScore(symbol.displayName, keywords);
    const layer = classifyLayer(symbol.filePath);
    const querySignal = hasQuerySignal(pathSignal, nameSignal);
    addFile(
      files,
      symbol.filePath,
      searchOnlyScore(2.4 - index * 0.05, pathSignal, nameSignal) +
        (querySignal ? layerPriority(layer, keywords) : 0),
      querySignal ? "symbol match" : "weak symbol match",
      symbol.displayName,
    );
    if (nameSignal > 0) addFile(files, symbol.filePath, 0, "symbol name matches query");
    if (!querySignal) addFile(files, symbol.filePath, 0, "weak search match");
    for (const reason of pathSignal.reasons) {
      addFile(files, symbol.filePath, 0, reason);
    }
  });

  results.exports.forEach((exp: SearchExportResult, index) => {
    const pathSignal = pathScore(exp.filePath, keywords);
    const nameSignal = symbolScore(exp.exportName, keywords);
    const layer = classifyLayer(exp.filePath);
    const querySignal = hasQuerySignal(pathSignal, nameSignal);
    addFile(
      files,
      exp.filePath,
      searchOnlyScore(2 - index * 0.05, pathSignal, nameSignal) +
        (querySignal ? layerPriority(layer, keywords) : 0),
      querySignal ? "export match" : "weak export match",
      exp.exportName,
    );
    if (nameSignal > 0) addFile(files, exp.filePath, 0, "export name matches query");
    if (!querySignal) addFile(files, exp.filePath, 0, "weak search match");
    for (const reason of pathSignal.reasons) {
      addFile(files, exp.filePath, 0, reason);
    }
  });

  return [...files.values()].sort((a, b) => b.score - a.score);
}

function isRouteLike(path: string) {
  return path.includes("packages/web/app/") || path.includes("packages/api/src/routes/");
}

function sharesFeatureKeyword(path: string, keywords: string[]) {
  const domains = extractDomains(path);
  return keywords.some((keyword) =>
    domains.some((domain) => domain.includes(keyword) || keyword.includes(domain)),
  );
}

async function applyGraphSignals(
  client: CodeMapClient,
  projectId: string,
  files: FeatureFile[],
  keywords: string[],
) {
  const candidates = files.slice(0, 12);
  await Promise.all(
    candidates.map(async (file) => {
      try {
        const parsed = await client.request<ParsedFileSummary>(
          `/projects/${encodeURIComponent(projectId)}/map/files/parse`,
          {
            authRequired: true,
            query: { path: file.path },
          },
        );
        const importedBy = parsed.importedBy ?? [];
        const imports = parsed.imports ?? [];
        const routeImporters = importedBy
          .map((edge) => edge.sourceFilePath ?? edge.sourcePath ?? "")
          .filter((sourcePath) => sourcePath && isRouteLike(sourcePath));
        if (routeImporters.length > 0) {
          file.score += 1.2;
          file.reasons.push("imported by entrypoint");
        }

        const featureImporters = importedBy
          .map((edge) => edge.sourceFilePath ?? edge.sourcePath ?? "")
          .filter((sourcePath) => sourcePath && sharesFeatureKeyword(sourcePath, keywords));
        if (featureImporters.length > 0) {
          file.score += 0.6;
          file.reasons.push("used by feature neighbor");
        }

        const candidateImports = imports
          .map((edge) => edge.targetPath ?? edge.targetPathText ?? "")
          .filter((targetPath) => targetPath && candidates.some((candidate) => candidate.path === targetPath));
        if (candidateImports.length > 0) {
          file.score += Math.min(candidateImports.length * 0.25, 0.75);
          file.reasons.push("connects ranked files");
        }

        file.reasons = [...new Set(file.reasons)];
      } catch {
        file.reasons = [...new Set(file.reasons)];
      }
    }),
  );

  return files.sort((a, b) => b.score - a.score);
}

function isWeakOnlyMatch(file: FeatureFile) {
  const strongReasons = [
    "file match",
    "exact feature segment",
    "feature domain match",
    "path keyword match",
    "filename match",
    "symbol name matches query",
    "export name matches query",
    "imported by entrypoint",
    "used by feature neighbor",
    "connects ranked files",
  ];
  return !file.reasons.some((reason) => strongReasons.includes(reason));
}

function filterRankedFiles(files: FeatureFile[]) {
  return files
    .filter((file) => !isWeakOnlyMatch(file))
    .sort((a, b) => b.score - a.score);
}

function rankConfidence(files: FeatureFile[]): Confidence {
  if (files.length === 0) return "low";
  const representedLayers = new Set(files.slice(0, 10).map((file) => file.layer));
  const topScore = files[0]?.score ?? 0;
  if (topScore >= 7 && representedLayers.size >= 3) return "high";
  if (topScore >= 4.5 && representedLayers.size >= 2) return "medium";
  return "low";
}

function formatGetFilesCall(files: FeatureFile[]) {
  const paths = files.slice(0, 7).map((file) => file.path);
  return `get_files(${JSON.stringify(paths)})`;
}

function buildOutput(query: string, files: FeatureFile[], confidence: Confidence) {
  const lines = [`# Feature area: ${query}`, ""];

  if (files.length === 0) {
    lines.push("No files found. Try a broader feature keyword.");
    return lines.join("\n");
  }

  const topFiles = files.slice(0, 10);
  lines.push(`Confidence: ${confidence}`);
  lines.push("");

  lines.push("## Recommended read order");
  topFiles.slice(0, 7).forEach((file, index) => {
    const symbols =
      file.symbols.length > 0 ? ` · symbols: ${file.symbols.slice(0, 3).join(", ")}` : "";
    lines.push(
      `${index + 1}. ${file.path} · score ${file.score.toFixed(2)} · ${file.layer} · ${file.reasons.join(", ")}${symbols}`,
    );
  });

  lines.push("");
  lines.push("## Next tool calls");
  lines.push(`- ${formatGetFilesCall(topFiles)}  // survey the feature area without reading full files`);
  const firstSymbolFile = topFiles.find((file) => file.symbols.length > 0);
  if (firstSymbolFile) {
    lines.push(
      `- get_symbol_context(symbol_name="${firstSymbolFile.symbols[0]}", file_path="${firstSymbolFile.path}")`,
    );
  } else if (topFiles[0]) {
    lines.push(`- get_file("${topFiles[0].path}", include=["outline"])`);
  }

  for (const layer of LAYERS) {
    const layerFiles = topFiles.filter((file) => file.layer === layer);
    if (layerFiles.length === 0) continue;
    lines.push("");
    lines.push(`## ${layer}`);
    for (const file of layerFiles) {
      const symbols =
        file.symbols.length > 0 ? `; symbols: ${file.symbols.slice(0, 5).join(", ")}` : "";
      lines.push(
        `- ${file.path} (${file.score.toFixed(2)}; ${file.reasons.join(", ")}${symbols})`,
      );
    }
  }

  return lines.join("\n");
}

export function registerSummarizeFeatureAreaTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "summarize_feature_area",
    {
      title: "Summarize Feature Area",
      description:
        "Use this for questions like 'which files are related to billing/auth/admin?' " +
        "Builds a compact feature-area map grouped by frontend routes, components, API clients, backend routes, services, schema/shared, tests/docs, and tools. " +
        "Automatically runs semantic embedding search in parallel with keyword search to surface conceptually related files — " +
        "especially useful for feature-level queries where code may not share exact keywords. " +
        "Prefer this before reading files when the user asks for related files by feature name. " +
        "project_id is optional if workspace is linked.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(200)
          .describe("Feature keyword or phrase, e.g. 'billing', 'auth redirect', 'admin import history'."),
        project_id: uuidSchema
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
        max_files: z
          .number()
          .int()
          .min(3)
          .max(30)
          .optional()
          .default(15)
          .describe("Maximum files to return. Default: 15."),
      },
    },
    withToolError(async ({ query, project_id, max_files }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());
      const keywords = normalizeQuery(query);

      if (!resolvedProjectId) {
        const { store, summary: localIndex } = await ensureLocalIndexWithSummary();
        const results = store.search(query, null);
        const files = filterRankedFiles(buildFiles(results, keywords)).slice(
          0,
          max_files ?? 15,
        );
        const confidence = rankConfidence(files);
        const suggestedNextTools =
          files.length > 0
            ? [
                formatGetFilesCall(files),
                files[0].symbols[0]
                  ? `get_symbol_context(symbol_name="${files[0].symbols[0]}", file_path="${files[0].path}")`
                  : `get_file("${files[0].path}", include=["outline"])`,
              ]
            : ["search_codebase(query)"];
        return success(buildOutput(query, files, confidence), {
          projectId: null,
          source: "local",
          localIndex,
          query,
          confidence,
          files: files.map((file) => ({
            path: file.path,
            layer: file.layer,
            score: file.score,
            reasons: file.reasons,
            symbols: file.symbols,
          })),
          groups: LAYERS.map((layer) => ({
            layer,
            files: files.filter((file) => file.layer === layer).map((file) => file.path),
          })).filter((group) => group.files.length > 0),
          suggestedNextTools,
        });
      }

      if (await shouldUseLocalIndexBeforeRemote(client, resolvedProjectId)) {
        const { store, summary: localIndex } = await ensureLocalIndexWithSummary();
        const results = store.search(query, null);
        const files = filterRankedFiles(buildFiles(results, keywords)).slice(
          0,
          max_files ?? 15,
        );
        const confidence = rankConfidence(files);
        const suggestedNextTools =
          files.length > 0
            ? [
                formatGetFilesCall(files),
                files[0].symbols[0]
                  ? `get_symbol_context(symbol_name="${files[0].symbols[0]}", file_path="${files[0].path}")`
                  : `get_file("${files[0].path}", include=["outline"])`,
              ]
            : ["search_codebase(query)"];

        return success(buildOutput(query, files, confidence), {
          projectId: resolvedProjectId,
          source: "local",
          localIndex,
          query,
          confidence,
          files: files.map((file) => ({
            path: file.path,
            layer: file.layer,
            score: file.score,
            reasons: file.reasons,
            symbols: file.symbols,
          })),
          groups: LAYERS.map((layer) => ({
            layer,
            files: files.filter((file) => file.layer === layer).map((file) => file.path),
          })).filter((group) => group.files.length > 0),
          suggestedNextTools,
        });
      }

      let results: CodebaseSearchResponse;
      let source: "remote" | "local" = "remote";
      let localIndexSummary: Awaited<ReturnType<typeof ensureLocalIndexWithSummary>>["summary"] | null = null;
      let semanticFiles: SemanticSearchResult[] = [];
      try {
        const [keywordResult, semanticResult] = await Promise.allSettled([
          client.request<CodebaseSearchResponse>(
            `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
            { authRequired: true, query: { q: query } },
          ),
          client.request<SemanticSearchResult[]>(
            `/projects/${encodeURIComponent(resolvedProjectId)}/map/search/semantic`,
            { authRequired: true, query: { q: query, limit: "8" } },
          ),
        ]);
        if (keywordResult.status === "rejected") throw keywordResult.reason;
        results = keywordResult.value;
        if (semanticResult.status === "fulfilled" && Array.isArray(semanticResult.value)) {
          semanticFiles = semanticResult.value;
        }
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        const { store, summary: localIndex } = await ensureLocalIndexWithSummary();
        results = store.search(query, null);
        source = "local";
        localIndexSummary = localIndex;
      }

      // Merge semantic paths into keyword results as synthetic file entries (deduped).
      if (source === "remote" && semanticFiles.length > 0) {
        const existingPaths = new Set([
          ...results.files.map((f) => f.path),
          ...results.symbols.map((s) => s.filePath),
        ]);
        for (const r of semanticFiles) {
          if (!existingPaths.has(r.path)) {
            results.files.push({ path: r.path, language: null } as SearchFileResult);
            existingPaths.add(r.path);
          }
        }
      }

      const rankedFiles =
        source === "remote"
          ? await applyGraphSignals(
              client,
              resolvedProjectId,
              buildFiles(results, keywords),
              keywords,
            )
          : buildFiles(results, keywords);
      const files = filterRankedFiles(rankedFiles).slice(0, max_files ?? 15);
      const confidence = rankConfidence(files);
      const suggestedNextTools =
        files.length > 0
          ? [
              formatGetFilesCall(files),
              files[0].symbols[0]
                ? `get_symbol_context(symbol_name="${files[0].symbols[0]}", file_path="${files[0].path}")`
                : `get_file("${files[0].path}", include=["outline"])`,
            ]
          : ["search_codebase(query)"];

      return success(buildOutput(query, files, confidence), {
        projectId: resolvedProjectId,
        source,
        ...(localIndexSummary ? { localIndex: localIndexSummary } : {}),
        query,
        confidence,
        files: files.map((file) => ({
          path: file.path,
          layer: file.layer,
          score: file.score,
          reasons: file.reasons,
          symbols: file.symbols,
        })),
        groups: LAYERS.map((layer) => ({
          layer,
          files: files.filter((file) => file.layer === layer).map((file) => file.path),
        })).filter((group) => group.files.length > 0),
        suggestedNextTools,
      });
    }),
  );
}
