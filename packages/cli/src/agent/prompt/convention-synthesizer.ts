import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { findMonorepoRoot } from "@codemap-ai/core/lib/monorepo-root.js";
import type { NineRouterProvider } from "../loop/provider.js";

// ─── Source definitions ───────────────────────────────────

const CONVENTION_SOURCES: Array<{ label: string; paths: string[] }> = [
  { label: "Claude Code",    paths: ["CLAUDE.md", ".claude/CLAUDE.md"] },
  { label: "Codex",          paths: [".codex/codemap-agent-pack.md", ".codex/config.toml", ".codex/agents/*.toml"] },
  { label: "Cursor",         paths: [".cursorrules", ".cursor/rules/*.mdc"] },
  { label: "Windsurf",       paths: [".windsurfrules"] },
  { label: "GitHub Copilot", paths: [".github/copilot-instructions.md"] },
  { label: "Cline",          paths: [".clinerules"] },
  { label: "OpenAI Codex",   paths: ["AGENTS.md"] },
  { label: "General",        paths: ["CONVENTIONS.md"] },
];

const RULE_SOURCES: Array<{ label: string; paths: string[] }> = [
  { label: "Claude Code rules", paths: [".claude/rules/*.md"] },
];

// ─── Types ────────────────────────────────────────────────

interface ScannedFile { label: string; filePath: string; content: string }

interface SynthMeta {
  hash: string;
  scannedFiles: string[];
  tokenCount: number;
  synthesizedAt: number;
}

// ─── Paths ────────────────────────────────────────────────

async function getWorkspaceRoot(): Promise<string> {
  return findMonorepoRoot(process.cwd());
}

async function dotCodemap(): Promise<string> {
  return path.join(await getWorkspaceRoot(), ".codemap");
}

async function cachePaths() {
  const dir = await dotCodemap();
  return {
    conventions: { md: path.join(dir, "synthesized-conventions.md"), meta: path.join(dir, "conventions-meta.json") },
    rules:       { md: path.join(dir, "synthesized-rules.md"),       meta: path.join(dir, "rules-meta.json") },
  };
}

// ─── Config ───────────────────────────────────────────────

interface AgentContextConfig { conventionMaxTokens?: number | null }

async function readConfig(root: string): Promise<AgentContextConfig> {
  try {
    return JSON.parse(await readFile(path.join(root, ".codemap", "agent-context.json"), "utf8")) as AgentContextConfig;
  } catch { return {}; }
}

// ─── Glob expansion ───────────────────────────────────────

async function expandGlob(root: string, pattern: string): Promise<string[]> {
  if (!pattern.includes("*")) {
    try { await stat(path.join(root, pattern)); return [pattern]; } catch { return []; }
  }
  const parts = pattern.split("/");
  const starIdx = parts.findIndex((p) => p.includes("*"));
  const parentDir = parts.slice(0, starIdx).join("/") || ".";
  const starPart = parts[starIdx]!;
  const rest = parts.slice(starIdx + 1).join("/");
  let entries: string[];
  try { entries = await readdir(path.join(root, parentDir)); } catch { return []; }
  const results: string[] = [];
  if (starPart === "*" && rest) {
    for (const e of entries) {
      const c = [parentDir === "." ? "" : parentDir, e, rest].filter(Boolean).join("/");
      try { await stat(path.join(root, c)); results.push(c); } catch {}
    }
  } else {
    const ext = path.extname(rest || starPart).replace("*", "");
    for (const e of entries) {
      if (!ext || e.endsWith(ext))
        results.push([parentDir === "." ? "" : parentDir, e].filter(Boolean).join("/"));
    }
  }
  return results;
}

async function scanSources(root: string, sources: Array<{ label: string; paths: string[] }>): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  for (const { label, paths } of sources) {
    for (const pattern of paths) {
      for (const rel of await expandGlob(root, pattern)) {
        try {
          const content = await readFile(path.join(root, rel), "utf8");
          if (content.trim()) results.push({ label, filePath: rel, content });
        } catch {}
      }
    }
  }
  return results;
}

// ─── Hashing & tokens ─────────────────────────────────────

function hashFiles(files: ScannedFile[]): string {
  const h = createHash("sha256");
  for (const f of files) h.update(f.filePath).update(f.content);
  return h.digest("hex").slice(0, 16);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Cache ────────────────────────────────────────────────

async function loadCache(paths: { md: string; meta: string }, hash: string): Promise<string | null> {
  try {
    const [content, metaRaw] = await Promise.all([readFile(paths.md, "utf8"), readFile(paths.meta, "utf8")]);
    const meta = JSON.parse(metaRaw) as SynthMeta;
    if (meta.hash === hash && content.trim()) return content;
  } catch {}
  return null;
}

async function saveCache(paths: { md: string; meta: string }, content: string, hash: string, files: ScannedFile[]): Promise<void> {
  const meta: SynthMeta = { hash, scannedFiles: files.map((f) => f.filePath), tokenCount: estimateTokens(content), synthesizedAt: Date.now() };
  await mkdir(await dotCodemap(), { recursive: true });
  await Promise.all([writeFile(paths.md, content, "utf8"), writeFile(paths.meta, JSON.stringify(meta, null, 2), "utf8")]);
}

// ─── Streaming synthesis ──────────────────────────────────

async function stream(provider: NineRouterProvider, model: string, prompt: string, userContent: string): Promise<string> {
  // Put the synthesis prompt in the user message — cx/* combo models have fixed system prompts
  // that override the system field, causing them to ignore synthesis instructions entirely.
  let result = "";
  for await (const chunk of provider.stream({
    model,
    messages: [{ role: "user", content: `${prompt}\n\n${userContent}` }],
  })) {
    if (chunk.text) result += chunk.text;
  }
  return result.trim();
}

function buildInput(files: ScannedFile[]): string {
  return files.map((f) => `=== ${f.label}: ${f.filePath} ===\n${f.content}`).join("\n\n");
}

// ─── 3 synthesis prompts ──────────────────────────────────

const CONVENTIONS_PROMPT = `You are synthesizing project configuration and convention files from multiple AI agent configs into a unified project guide.

Instructions:
- Merge overlapping content, keep the most specific version
- Remove exact duplicates
- Keep: architecture, tech stack, coding style, naming conventions, commands, UI routes, design system
- Skip: rule lists and skill workflows (those are handled separately)
- Organize by topic with ## headers
- Output clean markdown

Output ONLY the unified guide. No preamble.`;

const RULES_PROMPT = `You are synthesizing project rule files into a unified rule set.

Instructions:
- Merge rules from all files
- Remove EXACT duplicate rules only — preserve all unique rules fully intact
- Do NOT compress, summarize, or shorten any rule
- Organize by topic with ## headers
- Output clean markdown

Output ONLY the unified rules. No preamble.`;

// ─── Per-type pipeline ────────────────────────────────────

async function runPipeline(
  files: ScannedFile[],
  paths: { md: string; meta: string },
  prompt: string,
  provider: NineRouterProvider,
  model: string,
  maxTokens: number | null | undefined,
  forceRefresh: boolean,
): Promise<string | null> {
  if (files.length === 0) return null;
  const hash = hashFiles(files);
  if (!forceRefresh) {
    const cached = await loadCache(paths, hash);
    if (cached) return cached;
  }
  const content = await stream(provider, model, prompt, buildInput(files));
  if (!content) return null;

  let final = content;
  if (maxTokens) {
    const est = estimateTokens(content);
    if (est > maxTokens) {
      final = content.slice(0, maxTokens * 4).trimEnd()
        + `\n\n_[Truncated — increase \`conventionMaxTokens\` in .codemap/agent-context.json]_`;
    }
  }
  await saveCache(paths, final, hash, files).catch(() => {});
  return final;
}

// ─── Public API ───────────────────────────────────────────

export interface SynthesisResult {
  conventions: string | null;
  rules: string | null;
  fromCache: boolean;
}

export async function loadOrSynthesizeAll(
  provider: NineRouterProvider,
  model: string,
  forceRefresh = false,
): Promise<SynthesisResult | null> {
  const config = await readConfig(await getWorkspaceRoot());
  const maxTokens = config.conventionMaxTokens ?? null;
  const cp = await cachePaths();

  const [conventionFiles, ruleFiles] = await Promise.all([
    scanSources(await getWorkspaceRoot(), CONVENTION_SOURCES),
    scanSources(await getWorkspaceRoot(), RULE_SOURCES),
  ]);

  if (conventionFiles.length === 0 && ruleFiles.length === 0) return null;

  const [conventions, rules] = await Promise.all([
    runPipeline(conventionFiles, cp.conventions, CONVENTIONS_PROMPT, provider, model, maxTokens, forceRefresh),
    runPipeline(ruleFiles, cp.rules, RULES_PROMPT, provider, model, null, forceRefresh),
  ]);

  const fromCache = !forceRefresh;
  return { conventions, rules, fromCache };
}

export async function refreshAll(
  provider: NineRouterProvider,
  model: string,
): Promise<SynthesisResult | null> {
  return loadOrSynthesizeAll(provider, model, true);
}

export async function getCachedContext(): Promise<{ conventions: string | null; rules: string | null }> {
  const cp = await cachePaths();
  const [conventions, rules] = await Promise.all([
    readFile(cp.conventions.md, "utf8").then((s) => s.trim() || null).catch(() => null),
    readFile(cp.rules.md, "utf8").then((s) => s.trim() || null).catch(() => null),
  ]);
  return { conventions, rules };
}
