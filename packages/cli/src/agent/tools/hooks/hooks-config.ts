import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Mastra hook types (mirrored from mastracode/dist/hooks/types.d.ts).
 * We re-declare locally to avoid a hard import from the dist bundle.
 */
export type HookEventName =
  | "PreToolUse"
  | "PostToolUse"
  | "Stop"
  | "UserPromptSubmit"
  | "SessionStart"
  | "SessionEnd"
  | "Notification";

export interface HookMatcher {
  tool_name?: string;
}

export interface HookDefinition {
  type: "command";
  command: string;
  matcher?: HookMatcher;
  timeout?: number;
  description?: string;
}

export interface HooksConfig {
  PreToolUse?: HookDefinition[];
  PostToolUse?: HookDefinition[];
  Stop?: HookDefinition[];
  UserPromptSubmit?: HookDefinition[];
  SessionStart?: HookDefinition[];
  SessionEnd?: HookDefinition[];
  Notification?: HookDefinition[];
}

function getCodemapHooksPath(projectDir: string): string {
  return join(projectDir, ".codemap", "hooks.json");
}

function getGlobalCodemapHooksPath(): string {
  return join(homedir(), ".codemap", "hooks.json");
}

function getGlobalMastracodeHooksPath(): string {
  return join(homedir(), ".mastracode", "hooks.json");
}

// --- Read/Write ---

function loadHooksFile(filePath: string): HooksConfig {
  try {
    if (!existsSync(filePath)) return {};
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as HooksConfig;
  } catch {
    return {};
  }
}

function writeHooksFile(filePath: string, config: HooksConfig): void {
  const dir = filePath.replace(/[/\\][^/\\]+$/, "");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// --- Merge ---

function mergeConfigs(...configs: HooksConfig[]): HooksConfig {
  const result: HooksConfig = {};
  const events: HookEventName[] = [
    "PreToolUse",
    "PostToolUse",
    "Stop",
    "UserPromptSubmit",
    "SessionStart",
    "SessionEnd",
    "Notification",
  ];
  for (const event of events) {
    const hooks: HookDefinition[] = [];
    for (const cfg of configs) {
      const list = cfg[event];
      if (Array.isArray(list)) hooks.push(...list);
    }
    if (hooks.length > 0) {
      result[event] = hooks;
    }
  }
  return result;
}

// --- Public API ---

/**
 * Load the merged hooks config for the given project.
 * Priority: project .codemap/hooks.json > global .codemap/hooks.json.
 */
export function loadCodemapHooks(projectDir: string): HooksConfig {
  const globalHooks = loadHooksFile(getGlobalCodemapHooksPath());
  const projectHooks = loadHooksFile(getCodemapHooksPath(projectDir));
  return mergeConfigs(globalHooks, projectHooks);
}

/**
 * Save user hooks to .codemap/hooks.json (project-level).
 */
export function saveProjectHooks(
  projectDir: string,
  config: HooksConfig,
): void {
  writeHooksFile(getCodemapHooksPath(projectDir), config);
}

/**
 * Load existing user hooks from .codemap/hooks.json.
 */
export function loadProjectHooks(projectDir: string): HooksConfig {
  return loadHooksFile(getCodemapHooksPath(projectDir));
}

/**
 * Load global hooks from ~/.codemap/hooks.json.
 */
export function loadGlobalHooks(): HooksConfig {
  return loadHooksFile(getGlobalCodemapHooksPath());
}

/**
 * Save hooks to ~/.codemap/hooks.json (global).
 */
export function saveGlobalHooks(config: HooksConfig): void {
  writeHooksFile(getGlobalCodemapHooksPath(), config);
}

/**
 * Load existing Mastra hooks from .mastracode/hooks.json.
 * Used to detect user-managed Mastra hooks that should be preserved.
 */
export function loadMastracodeHooks(): HooksConfig {
  return loadHooksFile(getGlobalMastracodeHooksPath());
}

/**
 * Write the merged hooks config to .mastracode/hooks.json so the
 * Mastra HookManager can pick it up on reload().
 */
export function writeMastracodeHooks(config: HooksConfig): void {
  writeHooksFile(getGlobalMastracodeHooksPath(), config);
}

/**
 * Full sync: load CodeMap hooks (user + built-in), merge with existing
 * Mastra hooks, write to .mastracode/hooks.json, return the merged config.
 */
export function syncHooksToMastra(projectDir: string): HooksConfig {
  const codemapHooks = loadCodemapHooks(projectDir);
  const existingMastra = loadMastracodeHooks();
  const merged = mergeConfigs(existingMastra, codemapHooks);
  writeMastracodeHooks(merged);
  return merged;
}
