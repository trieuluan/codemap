import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type {
  CodebaseSearchResponse,
  SearchExportResult,
  SearchFileResult,
  SearchSymbolResult,
} from "../lib/api-types.js";

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
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter((word) => word.length > 2);
}

function pathScore(path: string, keywords: string[]) {
  const lower = path.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (lower.includes(`/${keyword}/`)) score += 1.4;
    else if (lower.includes(keyword)) score += 0.8;
  }
  if (path.endsWith("loading.tsx") || path.endsWith("error.tsx")) score -= 0.7;
  if (path.includes("/node_modules/")) score -= 10;
  return score;
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
    addFile(
      files,
      file.path,
      3 - index * 0.08 + pathScore(file.path, keywords),
      "file match",
    );
  });

  results.symbols.forEach((symbol: SearchSymbolResult, index) => {
    addFile(
      files,
      symbol.filePath,
      2.4 - index * 0.05 + pathScore(symbol.filePath, keywords),
      "symbol match",
      symbol.displayName,
    );
  });

  results.exports.forEach((exp: SearchExportResult, index) => {
    addFile(
      files,
      exp.filePath,
      2 - index * 0.05 + pathScore(exp.filePath, keywords),
      "export match",
      exp.exportName,
    );
  });

  return [...files.values()].sort((a, b) => b.score - a.score);
}

function formatGetFilesCall(files: FeatureFile[]) {
  const paths = files.slice(0, 7).map((file) => file.path);
  return `get_files(${JSON.stringify(paths)})`;
}

function buildOutput(query: string, files: FeatureFile[]) {
  const lines = [`# Feature area: ${query}`, ""];

  if (files.length === 0) {
    lines.push("No files found. Try a broader feature keyword.");
    return lines.join("\n");
  }

  const topFiles = files.slice(0, 10);

  lines.push("## Recommended read order");
  topFiles.slice(0, 7).forEach((file, index) => {
    const symbols =
      file.symbols.length > 0 ? ` · symbols: ${file.symbols.slice(0, 3).join(", ")}` : "";
    lines.push(
      `${index + 1}. ${file.path} · ${file.layer} · ${file.reasons.join(", ")}${symbols}`,
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
        `- ${file.path} (${file.reasons.join(", ")}${symbols})`,
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
        "Prefer this before reading files when the user asks for related files by feature name. " +
        "project_id is optional if workspace is linked.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(200)
          .describe("Feature keyword or phrase, e.g. 'billing', 'auth redirect', 'admin import history'."),
        project_id: z
          .string()
          .uuid()
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

      if (!resolvedProjectId) {
        return success("No project linked. Run link_project or get_project first.", {
          projectId: null,
          query,
          files: [],
          groups: [],
          suggestedNextTools: [],
        });
      }

      const results = await client.request<CodebaseSearchResponse>(
        `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
        { authRequired: true, query: { q: query } },
      );

      const files = buildFiles(results, normalizeQuery(query)).slice(0, max_files ?? 15);
      const suggestedNextTools =
        files.length > 0
          ? [
              formatGetFilesCall(files),
              files[0].symbols[0]
                ? `get_symbol_context(symbol_name="${files[0].symbols[0]}", file_path="${files[0].path}")`
                : `get_file("${files[0].path}", include=["outline"])`,
            ]
          : ["search_codebase(query)"];

      return success(buildOutput(query, files), {
        projectId: resolvedProjectId,
        query,
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
