import path from "node:path";

import { collectWorkspaceFiles } from "@codemap/code-index";

import { loadConfig } from "../../config.js";
import { createCodeMapClient } from "../../lib/codemap-api.js";
import { ensureLocalIndexWithSummary } from "../../lib/local-index.js";
import {
  readWorkspacePath,
  readWorkspaceProjectId,
} from "../../lib/workspace-project.js";

export interface IndexedFileOption {
  path: string;
  label?: string;
  hint?: string;
}

export async function searchIndexedFiles(
  query: string,
): Promise<IndexedFileOption[]> {
  const normalized = query.trim();
  debugFileSearch("start", { query: normalized, cwd: process.cwd() });

  const localResults = await searchLocalIndex(normalized);
  debugFileSearch("local results", { count: localResults.length });
  if (localResults.length > 0) return localResults;

  const workspaceResults = await searchWorkspaceFiles(normalized);
  debugFileSearch("workspace results", { count: workspaceResults.length });
  if (workspaceResults.length > 0) return workspaceResults;

  const remoteResults = normalized ? await searchRemoteIndex(normalized) : [];
  debugFileSearch("remote results", { count: remoteResults.length });
  return remoteResults;
}

async function searchLocalIndex(query: string): Promise<IndexedFileOption[]> {
  try {
    const { store } = await ensureLocalIndexWithSummary();
    const meta = store.getMeta();
    debugFileSearch("local index opened", {
      dbPath: store.dbPath,
      workspaceRootPath: meta?.workspaceRootPath,
      indexedAt: meta?.indexedAt,
    });

    const pathMatches = rankFiles(
      store.listFiles(5000).filter((file) => isSelectablePath(file.path)),
      query,
    ).map((file) => ({
      path: file.path,
      label: file.path,
      hint: formatHint(file.language, file.parseStatus, "local index"),
    }));

    if (!query || pathMatches.length > 0) return pathMatches;

    const searchMatches = uniqueByPath(
      store
        .search(query, null)
        .files.filter((file) => isSelectablePath(file.path))
        .slice(0, 50)
        .map((file) => ({
          path: file.path,
          label: file.path,
          hint: formatHint(file.language, undefined, "local index"),
        })),
    );
    debugFileSearch("local full-text results", { count: searchMatches.length });
    return searchMatches;
  } catch (error) {
    debugFileSearch("local failed", error);
    return [];
  }
}

async function searchRemoteIndex(query: string): Promise<IndexedFileOption[]> {
  try {
    const [config, projectId] = await Promise.all([
      loadConfig(),
      readWorkspaceProjectId(),
    ]);
    if (!projectId || !config.apiToken) {
      debugFileSearch("remote skipped", {
        hasProjectId: Boolean(projectId),
        hasApiToken: Boolean(config.apiToken),
      });
      return [];
    }

    const client = createCodeMapClient(config);
    const results = await client.request<{
      files?: Array<{ path: string; language?: string | null }>;
    }>(`/projects/${encodeURIComponent(projectId)}/map/search`, {
      authRequired: true,
      query: { q: query },
    });

    return (results.files ?? [])
      .filter((file) => isSelectablePath(file.path))
      .slice(0, 50)
      .map((file) => ({
        path: file.path,
        label: file.path,
        hint: formatHint(file.language ?? null, undefined, "cloud index"),
      }));
  } catch (error) {
    debugFileSearch("remote failed", error);
    return [];
  }
}

async function searchWorkspaceFiles(
  query: string,
): Promise<IndexedFileOption[]> {
  try {
    const workspacePath = await readWorkspacePath();
    debugFileSearch("workspace scan", { workspacePath });
    const files = await collectWorkspaceFiles(workspacePath);
    return rankFiles(
      files.filter((file) => file.isText && isSelectablePath(file.path)),
      query,
    ).map((file) => ({
      path: file.path,
      label: file.path,
      hint: formatHint(file.language, file.parseStatus, "workspace"),
    }));
  } catch (error) {
    debugFileSearch("workspace failed", error);
    return [];
  }
}

function rankFiles<T extends { path: string }>(files: T[], query: string): T[] {
  return files
    .map((file) => ({
      file,
      score: scorePath(file.path, query),
    }))
    .filter((item) => !query || item.score < Number.MAX_SAFE_INTEGER)
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.file.path.localeCompare(right.file.path),
    )
    .slice(0, 50)
    .map((item) => item.file);
}

function uniqueByPath(items: IndexedFileOption[]): IndexedFileOption[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
}

function scorePath(filePath: string, query: string): number {
  if (!query) return sourcePreferencePenalty(filePath);

  const normalizedPath = filePath.toLowerCase();
  const normalizedName = path.posix.basename(normalizedPath);
  const normalizedQuery = query.toLowerCase();
  const queryTokens = splitTerms(normalizedQuery);
  const basePenalty = sourcePreferencePenalty(filePath);

  if (normalizedName === normalizedQuery) return basePenalty;
  if (stripExtension(normalizedName) === normalizedQuery)
    return basePenalty + 1;
  if (normalizedName.includes(normalizedQuery)) return basePenalty + 10;
  if (normalizedPath.includes(normalizedQuery)) return basePenalty + 20;
  if (
    queryTokens.length > 0 &&
    queryTokens.every((term) => normalizedPath.includes(term))
  ) {
    return basePenalty + 30;
  }
  if (isSubsequence(normalizedQuery, normalizedPath)) return basePenalty + 45;

  return Number.MAX_SAFE_INTEGER;
}

function sourcePreferencePenalty(filePath: string): number {
  const lower = filePath.toLowerCase();
  let score = 0;
  if (
    /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|php|dart|css|scss|md|json)$/.test(
      lower,
    )
  ) {
    score -= 5;
  }
  if (lower.includes("/src/") || lower.startsWith("src/")) score -= 4;
  if (lower.includes("/features/") || lower.includes("/lib/")) score -= 2;
  if (
    lower.includes("/dist/") ||
    lower.includes("/build/") ||
    lower.includes("/coverage/")
  )
    score += 50;
  if (lower.includes("/node_modules/") || lower.includes("/.next/"))
    score += 100;
  if (lower.startsWith(".") || lower.includes("/.")) score += 20;
  return score;
}

function isSelectablePath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ds_store")) return false;
  if (lower.includes("/node_modules/") || lower.includes("/.git/"))
    return false;
  if (
    lower.includes("/dist/") ||
    lower.includes("/build/") ||
    lower.includes("/coverage/")
  )
    return false;
  return true;
}

function splitTerms(query: string): string[] {
  return query
    .split(/[\s\-_/.,:]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function isSubsequence(query: string, value: string): boolean {
  let queryIndex = 0;
  for (const char of value) {
    if (char === query[queryIndex]) queryIndex += 1;
    if (queryIndex === query.length) return true;
  }
  return false;
}

function formatHint(
  language: string | null | undefined,
  parseStatus: string | undefined,
  source: string,
): string {
  return [language, parseStatus, source].filter(Boolean).join(" · ");
}

function debugFileSearch(message: string, details?: unknown) {
  if (process.env.CODEMAP_DEBUG_FILE_SEARCH !== "1") return;
  const suffix =
    details === undefined
      ? ""
      : ` ${
          details instanceof Error
            ? details.stack ?? details.message
            : JSON.stringify(details)
        }`;
  process.stderr.write(`[codemap:file-search] ${message}${suffix}\n`);
}
