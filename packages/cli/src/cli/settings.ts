import { homedir } from "node:os";
import path from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { readWorkspacePath } from "@codemap-ai/core/lib/workspace-project.js";
import type { GatewayProviderId } from "../agent/types.js";

// ─── Schema ───────────────────────────────────────────────────────

export interface SettingsGateway {
  provider?: GatewayProviderId;
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  modeDefaults?: {
    build?: string;
    plan?: string;
    fast?: string;
  };
}

export interface SettingsCodemap {
  apiUrl?: string;
  apiToken?: string;
  projectId?: string | null;
  workspaceRootPath?: string | null;
}

export interface SettingsMcpServer {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  priorityResources?: string[];
}

export interface SettingsMaintenance {
  lastSpanCleanupAt?: number;
}

export interface SettingsAgent {
  /** Enable or disable working memory across sessions. Default: true. */
  workingMemory?: boolean;
}

export interface SettingsFile {
  gateway?: SettingsGateway;
  codemap?: SettingsCodemap;
  mcpServers?: Record<string, SettingsMcpServer>;
  theme?: string;
  maintenance?: SettingsMaintenance;
  agent?: SettingsAgent;
}

export type SettingsScope = "global" | "project";

// ─── Defaults ─────────────────────────────────────────────────────

export const SETTINGS_DEFAULTS: Required<Pick<SettingsFile, "gateway">> = {
  gateway: {
    provider: "9router",
    baseUrl: "http://localhost:4000/v1",
    defaultModel: "coder",
    modeDefaults: {
      build: "coder",
      plan: "gpt-5",
      fast: "gpt-5-mini",
    },
  },
};

// ─── Paths ────────────────────────────────────────────────────────

export function getGlobalSettingsPath(): string {
  return path.join(homedir(), ".codemap", "settings.json");
}

export async function getProjectSettingsPath(cwd?: string): Promise<string> {
  const root = await readWorkspacePath(cwd);
  return path.join(root, ".codemap", "settings.json");
}

// ─── Layered Load ─────────────────────────────────────────────────

export async function loadSettings(cwd = process.cwd()): Promise<SettingsFile> {
  const globalPath = getGlobalSettingsPath();
  const projectPath = await getProjectSettingsPath(cwd);

  const globalSettings = (await readJsonFile<SettingsFile>(globalPath)) ?? {};
  const projectSettings = (await readJsonFile<SettingsFile>(projectPath)) ?? {};

  // Merge: defaults ← global ← project
  let merged = mergeSettings(SETTINGS_DEFAULTS, globalSettings);
  merged = mergeSettings(merged, projectSettings);

  // Env vars always win
  merged = applyEnvOverrides(merged);

  return merged;
}

// ─── Merge ────────────────────────────────────────────────────────

function mergeSettings(base: SettingsFile, override: SettingsFile): SettingsFile {
  const result: SettingsFile = { ...base };

  if (override.theme !== undefined) result.theme = override.theme;

  if (override.gateway) {
    result.gateway = { ...base.gateway, ...override.gateway };
  }
  if (override.codemap) {
    result.codemap = { ...base.codemap, ...override.codemap };
  }
  if (override.mcpServers) {
    result.mcpServers = { ...base.mcpServers, ...override.mcpServers };
  }
  if (override.maintenance) {
    result.maintenance = { ...base.maintenance, ...override.maintenance };
  }
  if (override.agent) {
    result.agent = { ...base.agent, ...override.agent };
  }

  return result;
}

// ─── Env overrides ────────────────────────────────────────────────

function applyEnvOverrides(settings: SettingsFile): SettingsFile {
  const result = { ...settings };
  const gw: SettingsGateway = { ...result.gateway };

  const ALL_PROVIDERS: GatewayProviderId[] = [
    "9router", "openai", "self-hosted",
    "anthropic", "google", "azure", "groq", "openrouter", "deepseek", "ollama", "mistral",
  ];
  const envProvider = process.env.CODEMAP_LLM_GATEWAY_PROVIDER?.trim();
  if (envProvider && ALL_PROVIDERS.includes(envProvider as GatewayProviderId)) {
    gw.provider = envProvider as GatewayProviderId;
  }

  const envBaseUrl = process.env.CODEMAP_LLM_GATEWAY_BASE_URL?.trim();
  if (envBaseUrl) gw.baseUrl = envBaseUrl;

  const envApiKey = process.env.CODEMAP_LLM_GATEWAY_API_KEY?.trim();
  if (envApiKey) gw.apiKey = envApiKey;

  const envModel = process.env.CODEMAP_LLM_GATEWAY_DEFAULT_MODEL?.trim()
    ?? process.env.CODEMAP_LLM_GATEWAY_CODER_MODEL?.trim();
  if (envModel) gw.defaultModel = envModel;

  const envBuildModel = process.env.CODEMAP_LLM_GATEWAY_BUILD_MODEL?.trim();
  const envPlanModel = process.env.CODEMAP_LLM_GATEWAY_PLAN_MODEL?.trim();
  const envFastModel = process.env.CODEMAP_LLM_GATEWAY_FAST_MODEL?.trim();
  if (envBuildModel || envPlanModel || envFastModel) {
    gw.modeDefaults = {
      ...gw.modeDefaults,
      ...(envBuildModel ? { build: envBuildModel } : {}),
      ...(envPlanModel ? { plan: envPlanModel } : {}),
      ...(envFastModel ? { fast: envFastModel } : {}),
    };
  }

  const envTheme = process.env.CODEMAP_THEME?.trim();
  if (envTheme) result.theme = envTheme;

  result.gateway = gw;
  return result;
}

// ─── Convenience accessors ────────────────────────────────────────

export function getGatewaySettings(settings: SettingsFile): SettingsGateway {
  return settings.gateway ?? {};
}

export function getCodemapSettings(settings: SettingsFile): SettingsCodemap {
  return settings.codemap ?? {};
}

export function getMcpServerSettings(settings: SettingsFile): Record<string, SettingsMcpServer> {
  return settings.mcpServers ?? {};
}

export function getThemeSetting(settings: SettingsFile): string | undefined {
  return settings.theme;
}

export function getAgentSettings(settings: SettingsFile): SettingsAgent {
  return settings.agent ?? {};
}

// ─── Writer (merge into existing file) ────────────────────────────

export async function writeSettings(
  scope: SettingsScope,
  patch: SettingsFile,
  cwd = process.cwd(),
): Promise<string> {
  const filePath = scope === "project"
    ? await getProjectSettingsPath(cwd)
    : getGlobalSettingsPath();

  const existing = await readJsonFile<SettingsFile>(filePath) ?? {};
  const merged = mergeSettings(existing, patch);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return filePath;
}

/**
 * Merge gateway fields into settings.json (convenience wrapper).
 */
export async function writeGatewayToSettings(
  scope: SettingsScope,
  gateway: SettingsGateway,
  cwd = process.cwd(),
): Promise<string> {
  return writeSettings(scope, { gateway }, cwd);
}

// ─── Has config check ─────────────────────────────────────────────

export async function hasSettingsOrLegacy(cwd = process.cwd()): Promise<boolean> {
  if (await fileExists(await getProjectSettingsPath(cwd))) return true;
  if (await fileExists(getGlobalSettingsPath())) return true;
  return hasGatewayEnv();
}

function hasGatewayEnv(): boolean {
  return [
    "CODEMAP_LLM_GATEWAY_PROVIDER",
    "CODEMAP_LLM_GATEWAY_BASE_URL",
    "CODEMAP_LLM_GATEWAY_API_KEY",
    "CODEMAP_LLM_GATEWAY_DEFAULT_MODEL",
    "CODEMAP_LLM_GATEWAY_CODER_MODEL",
    "CODEMAP_LLM_GATEWAY_BUILD_MODEL",
    "CODEMAP_LLM_GATEWAY_PLAN_MODEL",
    "CODEMAP_LLM_GATEWAY_FAST_MODEL",
  ].some((key) => process.env[key]);
}

// ─── Helpers ──────────────────────────────────────────────────────

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
