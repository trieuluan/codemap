import { access } from "node:fs/promises";
import type { GatewayConfig } from "../agent/types.js";
import {
  type SettingsScope,
  loadSettings,
  writeGatewayToSettings,
  hasSettingsOrLegacy,
  getProjectSettingsPath,
  getGlobalSettingsPath,
  SETTINGS_DEFAULTS,
} from "./settings.js";

export const DEFAULT_PROVIDER = SETTINGS_DEFAULTS.gateway!.provider!;
export const DEFAULT_BASE_URL = SETTINGS_DEFAULTS.gateway!.baseUrl!;
export const DEFAULT_MODEL = SETTINGS_DEFAULTS.gateway!.defaultModel!;
export const DEFAULT_MODE_DEFAULTS = SETTINGS_DEFAULTS.gateway!.modeDefaults!;

export async function loadGatewayConfig(): Promise<GatewayConfig> {
  const settings = await loadSettings();
  const gw = settings.gateway ?? {};

  const provider = gw.provider ?? DEFAULT_PROVIDER;
  const baseUrl = gw.baseUrl ?? DEFAULT_BASE_URL;
  const apiKey = gw.apiKey;
  const modeDefaults = { ...DEFAULT_MODE_DEFAULTS, ...gw.modeDefaults };
  const defaultModel = gw.defaultModel ?? modeDefaults.build ?? DEFAULT_MODEL;

  const hasEnv = hasGatewayEnv();
  const configSource = hasEnv
    ? "env vars"
    : await hasSettingsOrLegacy()
      ? "file"
      : "built-in defaults";

  return {
    provider,
    baseUrl,
    apiKey,
    defaultModel,
    modeDefaults,
    models: Array.from(new Set([defaultModel, ...Object.values(modeDefaults)].filter(Boolean))),
    configSource,
  };
}

export async function writeGatewayConfig(config: {
  scope: SettingsScope;
  force?: boolean;
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
  modeDefaults?: { build?: string; plan?: string; fast?: string };
  provider?: GatewayConfig["provider"];
}): Promise<{ path: string; scope: SettingsScope; created: boolean }> {
  const targetPath = getGatewayConfigPath(config.scope);
  const existed = await fileExists(targetPath);

  if (existed && !config.force) {
    return { path: targetPath, scope: config.scope, created: false };
  }

  const filePath = await writeGatewayToSettings(
    config.scope,
    {
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      defaultModel: config.defaultModel,
      modeDefaults: config.modeDefaults,
    },
  );
  return { path: filePath, scope: config.scope, created: !existed };
}

export async function hasConfigOrEnvSetup(): Promise<boolean> {
  return hasSettingsOrLegacy();
}

/** Return the settings.json file path for the given scope. */
export function getGatewayConfigPath(scope: SettingsScope): string {
  return scope === "project"
    ? getProjectSettingsPath()
    : getGlobalSettingsPath();
}

export function buildDefaultGatewayFile(): string {
  return JSON.stringify(
    {
      gateway: {
        provider: DEFAULT_PROVIDER,
        baseUrl: DEFAULT_BASE_URL,
        defaultModel: DEFAULT_MODEL,
        modeDefaults: DEFAULT_MODE_DEFAULTS,
      },
    },
    null,
    2,
  );
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
  ].some((k) => process.env[k]);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
