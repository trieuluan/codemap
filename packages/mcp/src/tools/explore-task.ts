import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureLocalIndexWithSummary } from "@codemap-ai/core/lib/local-index.js";
import { searchLocalSemantic } from "@codemap-ai/core/lib/local-vector-index.js";
import { success, withToolError } from "@codemap-ai/core/lib/tool-response.js";
import { sessionTracker } from "@codemap-ai/core/lib/session-tracker.js";
import type {
  CodebaseSearchResponse,
  EditLocationReadPlan,
} from "@codemap-ai/core/lib/api-types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContextFile {
  path: string;
  language: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
  readPlan: EditLocationReadPlan;
  blastRadius?: number;
}

interface ContextSymbol {
  name: string;
  kind: string;
  filePath: string;
  startLine: number | null;
  signature: string | null;
}

interface ContextRisk {
  level: "high" | "medium";
  file: string;
  reason: string;
}

interface RecommendedRead {
  path: string;
  priority: number;
  readPlan: EditLocationReadPlan;
  why: string;
}

interface ContextPack {
  task: string;
  summary: string;
  likelyFiles: ContextFile[];
  entrypoints: ContextFile[];
  symbols: ContextSymbol[];
  risks: ContextRisk[];
  recommendedReads: RecommendedRead[];
  suggestedNextTools: string[];
}

interface FileRelationship {
  imports: Array<{ targetPath: string | null }>;
  importedBy: Array<{ sourcePath: string }>;
}

interface LocalExploreData {
  likelyFiles: ContextFile[];
  entrypoints: ContextFile[];
  symbols: ContextSymbol[];
  importerCounts: Map<string, number>;
}

// ── Entrypoint detection ──────────────────────────────────────────────────────

const ENTRYPOINT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\/routes\/[^/]+\/index\.[jt]sx?$/, label: "API route" },
  { pattern: /\/app\/.*\/page\.tsx?$/, label: "Next.js page" },
  { pattern: /\/controller\.[jt]sx?$/, label: "controller" },
  { pattern: /\.worker\.[jt]s$/, label: "worker" },
  { pattern: /\/plugins\/\d+\.[^/]+\.[jt]s$/, label: "Fastify plugin" },
];

function detectEntrypoint(path: string): string | null {
  for (const { pattern, label } of ENTRYPOINT_PATTERNS) {
    if (pattern.test(path)) return label;
  }
  return null;
}

// ── Risk detection ────────────────────────────────────────────────────────────

const RISK_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
  level: "high" | "medium";
}> = [
  {
    pattern: /schema\.[jt]sx?$/,
    reason: "Schema file — changes affect DB structure and API types",
    level: "high",
  },
  {
    pattern: /better-auth|05\.better-auth/,
    reason: "Auth plugin — changes affect all authenticated routes",
    level: "high",
  },
  {
    pattern: /(^|\/)auth\.[jt]sx?$/,
    reason: "Core auth module — changes affect session handling",
    level: "high",
  },
  {
    pattern: /\/middleware\.[jt]sx?$/,
    reason: "Middleware — changes affect all requests",
    level: "high",
  },
  {
    pattern: /\/plugins\/\d+\./,
    reason: "Fastify plugin — changes affect the request pipeline",
    level: "medium",
  },
];

function detectPathRisk(path: string): ContextRisk | null {
  for (const { pattern, reason, level } of RISK_PATTERNS) {
    if (pattern.test(path)) return { level, file: path, reason };
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatReadCall(path: string, plan: EditLocationReadPlan): string {
  const parts: string[] = [`include=${JSON.stringify(plan.include)}`];
  if (plan.symbolNames?.length)
    parts.push(`symbol_names=${JSON.stringify(plan.symbolNames)}`);
  return `get_file("${path}", ${parts.join(", ")})`;
}

const OUTLINE_PLAN: EditLocationReadPlan = { include: ["outline"] };

function buildLocalReadPlan(symbol: ContextSymbol | null): EditLocationReadPlan {
  if (!symbol?.name) return OUTLINE_PLAN;
  return { include: ["symbols"], symbolNames: [symbol.name] };
}

function tokenizeLocalQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s\-_/.,:]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

function buildLocalReason(path: string, query: string, symbol?: ContextSymbol | null): string {
  const parts: string[] = [];
  if (symbol?.name) parts.push(`symbol match: ${symbol.name}`);

  const terms = tokenizeLocalQuery(query);
  const lowerPath = path.toLowerCase();
  const matchedTerms = terms.filter((term) => lowerPath.includes(term));
  if (matchedTerms.length > 0) {
    parts.push(`path matches: ${matchedTerms.slice(0, 3).join(", ")}`);
  }

  return parts[0] ?? "local index match";
}

function buildLocalExploreData(
  task: string,
  results: CodebaseSearchResponse,
  importerCountsByPath: Map<string, number>,
): LocalExploreData {
  const likelyFiles: ContextFile[] = [];
  const likelyFilePaths = new Set<string>();
  const importerCounts = new Map<string, number>();
  const symbolByPath = new Map<string, ContextSymbol[]>();

  const symbols: ContextSymbol[] = results.symbols.slice(0, 8).map((s) => ({
    name: s.displayName,
    kind: s.symbolKind,
    filePath: s.filePath,
    startLine: s.startLine ?? null,
    signature: s.signature ?? null,
  }));

  for (const symbol of symbols) {
    const existing = symbolByPath.get(symbol.filePath) ?? [];
    existing.push(symbol);
    symbolByPath.set(symbol.filePath, existing);
  }

  const pushLikelyFile = (
    path: string,
    language: string | null,
    confidence: ContextFile["confidence"],
    baseReason?: string,
    blastRadius?: number,
  ) => {
    if (likelyFilePaths.has(path)) return;
    const topSymbol = symbolByPath.get(path)?.[0] ?? null;
    likelyFiles.push({
      path,
      language,
      confidence,
      reason: baseReason ?? buildLocalReason(path, task, topSymbol),
      readPlan: buildLocalReadPlan(topSymbol),
      ...(blastRadius !== undefined ? { blastRadius } : {}),
    });
    likelyFilePaths.add(path);
  };

  for (const symbol of results.symbols.slice(0, 8)) {
    const importerCount = importerCountsByPath.get(symbol.filePath);
    if (typeof importerCount === "number") importerCounts.set(symbol.filePath, importerCount);
    pushLikelyFile(
      symbol.filePath,
      null,
      "high",
      `symbol match: ${symbol.displayName}`,
      importerCount,
    );
  }

  for (const file of results.files.slice(0, 8)) {
    const importerCount = importerCountsByPath.get(file.path);
    if (typeof importerCount === "number") importerCounts.set(file.path, importerCount);
    pushLikelyFile(
      file.path,
      file.language ?? null,
      likelyFilePaths.size < 4 ? "high" : "medium",
      undefined,
      importerCount,
    );
  }

  const entrypointMap = new Map<string, string>();
  for (const path of likelyFiles.map((f) => f.path)) {
    const label = detectEntrypoint(path);
    if (label && !entrypointMap.has(path)) entrypointMap.set(path, label);
  }

  const entrypoints: ContextFile[] = [...entrypointMap.entries()].map(([path, label]) => ({
    path,
    language: null,
    confidence: "medium",
    reason: label,
    readPlan: OUTLINE_PLAN,
    ...(importerCounts.has(path) ? { blastRadius: importerCounts.get(path) } : {}),
  }));

  return { likelyFiles, entrypoints, symbols, importerCounts };
}

async function buildLocalFallbackResponse(
  projectId: string,
  task: string,
  fallbackReason: string,
) {
  const { store } = await ensureLocalIndexWithSummary();
  const localSearch = store.search(task, null);
  const importerCountsByPath = new Map<string, number>();

  for (const file of localSearch.files.slice(0, 8)) {
    const parse = store.getFileParse(file.path);
    importerCountsByPath.set(file.path, parse?.importedBy.length ?? 0);
  }

  for (const symbol of localSearch.symbols.slice(0, 8)) {
    if (importerCountsByPath.has(symbol.filePath)) continue;
    const parse = store.getFileParse(symbol.filePath);
    importerCountsByPath.set(symbol.filePath, parse?.importedBy.length ?? 0);
  }

  const localData = buildLocalExploreData(task, localSearch, importerCountsByPath);
  const semanticMatches = await searchLocalSemantic(store, task, 5, false).catch(() => []);
  const existingPaths = new Set([
    ...localData.likelyFiles.map((f) => f.path),
    ...localData.entrypoints.map((f) => f.path),
  ]);
  for (const m of semanticMatches) {
    if (existingPaths.has(m.path)) continue;
    existingPaths.add(m.path);
    localData.likelyFiles.push({
      path: m.path,
      language: m.language,
      confidence: "low",
      reason: `Semantic match (score: ${Math.round(m.score * 100)}%)`,
      readPlan: OUTLINE_PLAN,
    });
  }
  const risks: ContextRisk[] = [];
  const risksSeen = new Set<string>();
  for (const path of [
    ...localData.likelyFiles.map((f) => f.path),
    ...localData.entrypoints.map((f) => f.path),
  ]) {
    if (risksSeen.has(path)) continue;
    const risk = detectPathRisk(path);
    if (risk) {
      risks.push(risk);
      risksSeen.add(path);
    }
  }

  const recommendedReads: RecommendedRead[] = [];
  let priority = 1;
  for (const f of [...localData.entrypoints, ...localData.likelyFiles]) {
    recommendedReads.push({
      path: f.path,
      priority: priority++,
      readPlan: f.readPlan,
      why: f.reason,
    });
  }

  const packBase = {
    task,
    likelyFiles: localData.likelyFiles,
    entrypoints: localData.entrypoints,
    symbols: localData.symbols,
    risks,
    recommendedReads,
  };
  const summary = [
    buildSummary(packBase),
    `Source: local SQLite index (${fallbackReason})`,
  ].join("\n");
  const suggestedNextTools = buildNextTools(packBase);
  const pack: ContextPack = { ...packBase, summary, suggestedNextTools };

  return success(buildTextOutput(pack), {
    projectId,
    available: true,
    source: "local",
    ...pack,
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────

function buildSummary(pack: Omit<ContextPack, "summary" | "suggestedNextTools">): string {
  const lines: string[] = [];

  const domains = [
    ...new Set(
      [...pack.likelyFiles, ...pack.entrypoints]
        .flatMap((f) =>
          f.path
            .split("/")
            .filter(
              (p) =>
                ![
                  "src", "features", "packages", "modules", "routes",
                  "app", "(auth)", "(protected)", "components", "api",
                  "lib", "utils", "hooks", "web", "index",
                ].includes(p) && !/\.[jt]sx?$/.test(p) && p.length > 2,
            )
            .slice(0, 2),
        ),
    ),
  ].slice(0, 4);

  lines.push(`Domain: ${domains.join(", ") || "unknown"}`);

  const highCount = pack.likelyFiles.filter((f) => f.confidence === "high").length;
  const totalFiles = pack.likelyFiles.length + pack.entrypoints.length;
  if (totalFiles > 0) {
    lines.push(
      `${totalFiles} relevant file(s)${highCount > 0 ? ` — ${highCount} high-confidence` : ""}`,
    );
  }

  if (pack.symbols.length > 0) {
    lines.push(
      `Key symbols: ${pack.symbols
        .slice(0, 3)
        .map((s) => s.name)
        .join(", ")}`,
    );
  }

  const highRisks = pack.risks.filter((r) => r.level === "high");
  if (highRisks.length > 0) {
    lines.push(
      `⚠ High-risk: ${highRisks.map((r) => r.file.split("/").pop()).join(", ")} — edit carefully`,
    );
  }

  return lines.join("\n");
}

// ── suggestedNextTools ────────────────────────────────────────────────────────

function buildNextTools(pack: Omit<ContextPack, "summary" | "suggestedNextTools">): string[] {
  const tools: string[] = [];
  const readPaths = pack.recommendedReads
    .slice(0, 7)
    .map((read) => read.path);

  if (readPaths.length > 1) {
    tools.push(`get_file(${JSON.stringify(readPaths)})`);
  }

  if (pack.recommendedReads.length > 0) {
    const top = pack.recommendedReads[0];
    tools.push(formatReadCall(top.path, top.readPlan));
  }

  if (pack.symbols.length > 0) {
    tools.push(`symbol(action="usages", symbol_name="${pack.symbols[0].name}")`);
  }

  const highRisk = pack.risks.find((r) => r.level === "high");
  if (highRisk) {
    const name = highRisk.file.split("/").pop()?.replace(/\.[jt]sx?$/, "") ?? "";
    tools.push(`symbol(action="callers", symbol_name="${name}", file_path="${highRisk.file}")  // check before editing high-risk file`);
  }

  tools.push(`find_related_files(query="${pack.task}")  // use if the task is mainly asking for scope/related files`);
  tools.push("diff()  // verify working-tree changes after editing");
  return tools;
}

// ── Text output ───────────────────────────────────────────────────────────────

function buildTextOutput(pack: ContextPack): string {
  const lines = [`## explore_task: "${pack.task}"`, "", pack.summary, ""];

  lines.push("### How to use this result");
  lines.push("- Start with the Recommended reads section; use the exact tool calls shown.");
  lines.push("- If this is only a scope/reading-list question, call find_related_files instead of editing.");
  lines.push("- Use get_file for a quick outline survey, then get_file(include=[\"symbols\"]) for the exact body you need.");
  lines.push("- Check Risks before editing high blast-radius files.");
  lines.push("");

  if (pack.entrypoints.length > 0) {
    lines.push("### Entry points");
    pack.entrypoints.forEach((f, i) => {
      lines.push(`${i + 1}. ${f.path}  [${f.reason}]`);
    });
    lines.push("");
  }

  if (pack.likelyFiles.length > 0) {
    lines.push("### Files to edit");
    pack.likelyFiles.forEach((f, i) => {
      const br = f.blastRadius !== undefined ? `  (${f.blastRadius} importers)` : "";
      lines.push(`${i + 1}. ${f.path}  [${f.confidence}]${br}`);
      lines.push(`   ${f.reason}`);
    });
    lines.push("");
  }

  if (pack.risks.length > 0) {
    lines.push("### Risks");
    pack.risks.forEach((r) => {
      lines.push(`⚠ [${r.level}] ${r.file}`);
      lines.push(`  ${r.reason}`);
    });
    lines.push("");
  }

  if (pack.symbols.length > 0) {
    lines.push("### Key symbols");
    pack.symbols.slice(0, 5).forEach((s) => {
      const loc = s.startLine ? `:${s.startLine}` : "";
      lines.push(`• ${s.name} [${s.kind}] — ${s.filePath}${loc}`);
    });
    lines.push("");
  }

  lines.push("### Recommended reads (in order)");
  if (pack.recommendedReads.length > 1) {
    lines.push(`Batch survey: get_file(${JSON.stringify(pack.recommendedReads.slice(0, 7).map((r) => r.path))})`);
  }
  pack.recommendedReads.slice(0, 6).forEach((r, i) => {
    lines.push(`${i + 1}. ${formatReadCall(r.path, r.readPlan)}`);
    lines.push(`   Why: ${r.why}`);
  });

  lines.push("");
  lines.push("### Next tools");
  pack.suggestedNextTools.forEach((t) => lines.push(`→ ${t}`));

  return lines.join("\n");
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerExploreTaskTool(server: McpServer) {
  server.registerTool(
    "explore_task",
    {
      title: "Explore Task",
      description:
        "FIRST STEP for any broad coding task — fixing bugs, implementing features, investigating issues, debugging, refactoring. " +
        "Searches the local SQLite index and returns likelyFiles, entrypoints, symbols, risks (blast radius), recommendedReads, and suggestedNextTools. " +
        "Call this BEFORE reading files blindly.",
      inputSchema: {
        task: z
          .string()
          .min(1)
          .max(500)
          .describe("Describe the task, feature, or bug to investigate."),
      },
    },
    withToolError(async ({ task }) => {
      sessionTracker.markCalled("explore_task");
      return buildLocalFallbackResponse("local", task, "local SQLite index");
    }),
  );
}
