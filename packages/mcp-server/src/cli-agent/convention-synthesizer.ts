import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { NineRouterProvider } from "./provider.js";

// ─── Convention file candidates (ordered by priority) ────

const CONVENTION_GLOBS: Array<{ label: string; paths: string[] }> = [
  { label: "Claude Code",        paths: ["CLAUDE.md", ".claude/CLAUDE.md"] },
  { label: "Claude Code rules",  paths: [".claude/rules/*.md"] },
  { label: "Claude Code skills", paths: [".claude/skills/*/SKILL.md"] },
  { label: "Codex",              paths: [".codex/codemap-agent-pack.md", ".codex/config.toml", ".codex/agents/*.toml"] },
  { label: "Codex skills",       paths: [".codex/skills/*/SKILL.md"] },
  { label: "Cursor",             paths: [".cursorrules", ".cursor/rules/*.mdc"] },
  { label: "Windsurf",           paths: [".windsurfrules"] },
  { label: "GitHub Copilot",     paths: [".github/copilot-instructions.md"] },
  { label: "Cline",              paths: [".clinerules"] },
  { label: "OpenAI Codex",       paths: ["AGENTS.md"] },
  { label: "General",            paths: ["CONVENTIONS.md"] },
];

interface ScannedFile { label: string; filePath: string; content: string }
interface ConventionMeta {
  hash: string;
  scannedFiles: string[];
  tokenCount: number;
  synthesizedAt: number;
}

// ─── Paths ────────────────────────────────────────────────

function getWorkspaceRoot(): string {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", cwd: process.cwd() });
  return r.stdout?.trim() || process.cwd();
}

function cacheDir(): string {
  return path.join(getWorkspaceRoot(), ".codemap");
}

function cachePaths() {
  const dir = cacheDir();
  return {
    conventions: path.join(dir, "synthesized-conventions.md"),
    meta: path.join(dir, "convention-meta.json"),
  };
}

// ─── Config ───────────────────────────────────────────────

interface AgentContextConfig { conventionMaxTokens?: number | null }

async function readAgentContextConfig(root: string): Promise<AgentContextConfig> {
  try {
    const raw = await readFile(path.join(root, ".codemap", "agent-context.json"), "utf8");
    return JSON.parse(raw) as AgentContextConfig;
  } catch { return {}; }
}

// ─── Scanner ──────────────────────────────────────────────

async function expandGlob(root: string, pattern: string): Promise<string[]> {
  if (!pattern.includes("*")) {
    try { await stat(path.join(root, pattern)); return [pattern]; }
    catch { return []; }
  }

  const { readdir } = await import("node:fs/promises");
  const parts = pattern.split("/");
  const starIdx = parts.findIndex((p) => p.includes("*"));

  if (starIdx === -1) return [];

  const parentDir = parts.slice(0, starIdx).join("/") || ".";
  const starPart = parts[starIdx]!;
  const rest = parts.slice(starIdx + 1).join("/");

  let entries: string[];
  try { entries = await readdir(path.join(root, parentDir)); }
  catch { return []; }

  const results: string[] = [];

  if (starPart === "*" && rest) {
    // Pattern like `skills/*/SKILL.md` — star is a directory wildcard
    for (const entry of entries) {
      const candidate = [parentDir === "." ? "" : parentDir, entry, rest]
        .filter(Boolean).join("/");
      try { await stat(path.join(root, candidate)); results.push(candidate); }
      catch { /* subdirectory doesn't have the file */ }
    }
  } else {
    // Pattern like `rules/*.md` — star matches filenames with optional extension
    const ext = path.extname(rest || starPart).replace("*", "");
    for (const entry of entries) {
      if (!ext || entry.endsWith(ext)) {
        results.push([parentDir === "." ? "" : parentDir, entry].filter(Boolean).join("/"));
      }
    }
  }

  return results;
}

async function scanConventionFiles(root: string): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  for (const { label, paths } of CONVENTION_GLOBS) {
    for (const pattern of paths) {
      for (const rel of await expandGlob(root, pattern)) {
        try {
          const content = await readFile(path.join(root, rel), "utf8");
          if (content.trim()) results.push({ label, filePath: rel, content });
        } catch { /* skip */ }
      }
    }
  }
  return results;
}

// ─── Hashing ──────────────────────────────────────────────

function hashFiles(files: ScannedFile[]): string {
  const h = createHash("sha256");
  for (const f of files) h.update(f.filePath).update(f.content);
  return h.digest("hex").slice(0, 16);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Synthesis ────────────────────────────────────────────

function buildSynthesisPrompt(maxTokens: number | null | undefined): string {
  const limitLine = maxTokens
    ? `\nTarget length: ~${Math.floor(maxTokens * 0.75 / 1.33)} words. Prioritize the most impactful rules if space is tight.`
    : "";

  return `You are synthesizing coding convention files from multiple AI agent configurations into a single unified guide.

Instructions:
- Merge overlapping rules, keep the most specific version
- Remove exact duplicates and redundant phrasing
- Preserve: coding style, naming conventions, project structure, tech stack specifics, workflow rules, tone/language preferences
- Drop: meta-instructions about how to USE the AI tool itself (e.g. "use MCP tools first")
- Organize by topic (e.g. ## Architecture, ## Conventions, ## Workflow)
- Output clean markdown${limitLine}

Output ONLY the unified guide. No preamble, no explanation.`;
}

function buildSynthesisInput(files: ScannedFile[]): string {
  const parts: string[] = [];
  for (const f of files) {
    parts.push(`=== ${f.label}: ${f.filePath} ===\n${f.content}`);
  }
  return parts.join("\n\n");
}

async function synthesize(
  files: ScannedFile[],
  provider: NineRouterProvider,
  model: string,
  maxTokens: number | null | undefined,
): Promise<string> {
  const systemPrompt = buildSynthesisPrompt(maxTokens);
  const userContent = buildSynthesisInput(files);

  let result = "";
  for await (const chunk of provider.stream({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  })) {
    if (chunk.text) result += chunk.text;
  }
  result = result.trim();

  // Safety net: truncate if AI exceeded the limit
  if (maxTokens) {
    const estimated = estimateTokens(result);
    if (estimated > maxTokens) {
      const charLimit = maxTokens * 4;
      result = result.slice(0, charLimit).trimEnd()
        + `\n\n_[Truncated — increase \`conventionMaxTokens\` in .codemap/agent-context.json to see more]_`;
    }
  }

  return result;
}

// ─── Public API ───────────────────────────────────────────

export interface ConventionSynthesisResult {
  content: string;
  fromCache: boolean;
  fileCount: number;
  tokenCount: number;
}

export async function loadOrSynthesizeConventions(
  provider: NineRouterProvider,
  plannerModel: string,
): Promise<ConventionSynthesisResult | null> {
  const root = getWorkspaceRoot();
  const config = await readAgentContextConfig(root);
  const maxTokens = config.conventionMaxTokens ?? null;

  const files = await scanConventionFiles(root);
  if (files.length === 0) return null;

  const hash = hashFiles(files);
  const { conventions: convPath, meta: metaPath } = cachePaths();

  // Try cache
  try {
    const [cached, metaRaw] = await Promise.all([
      readFile(convPath, "utf8"),
      readFile(metaPath, "utf8"),
    ]);
    const meta = JSON.parse(metaRaw) as ConventionMeta;
    if (meta.hash === hash && cached.trim()) {
      return { content: cached, fromCache: true, fileCount: files.length, tokenCount: meta.tokenCount };
    }
  } catch { /* cache miss */ }

  // Synthesize
  const content = await synthesize(files, provider, plannerModel, maxTokens);
  if (!content) return null;

  const tokenCount = estimateTokens(content);

  // Save cache
  try {
    await mkdir(cacheDir(), { recursive: true });
    const meta: ConventionMeta = {
      hash,
      scannedFiles: files.map((f) => f.filePath),
      tokenCount,
      synthesizedAt: Date.now(),
    };
    await Promise.all([
      writeFile(convPath, content, "utf8"),
      writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8"),
    ]);
  } catch { /* non-blocking */ }

  return { content, fromCache: false, fileCount: files.length, tokenCount };
}

export async function refreshConventions(
  provider: NineRouterProvider,
  plannerModel: string,
): Promise<ConventionSynthesisResult | null> {
  // Delete cache to force re-synthesis
  const { meta: metaPath } = cachePaths();
  try { await writeFile(metaPath, "{}", "utf8"); } catch { /* ignore */ }
  return loadOrSynthesizeConventions(provider, plannerModel);
}

export async function getCachedConventions(): Promise<string | null> {
  try {
    const content = await readFile(cachePaths().conventions, "utf8");
    return content.trim() || null;
  } catch { return null; }
}
