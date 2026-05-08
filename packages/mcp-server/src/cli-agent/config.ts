import { homedir } from "node:os";
import path from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";

import type { GatewayConfig, GatewayMode, ModelProfile } from "./types.js";

export interface FileGatewayConfig {
  baseUrl?: string;
  apiKey?: string;
  mode?: GatewayMode;
  defaultProfile?: string;
  profiles?: ModelProfile[];
}

export type GatewayConfigScope = "project" | "global";

export interface WriteGatewayConfigOptions {
  scope: GatewayConfigScope;
  cwd?: string;
  force?: boolean;
  baseUrl?: string;
  mode?: GatewayMode;
}

export const DEFAULT_BASE_URL = "http://localhost:4000/v1";
const DEFAULT_MODE: GatewayMode = "hybrid";

export async function loadGatewayConfig(
  cwd = process.cwd(),
): Promise<GatewayConfig> {
  const fileConfig = await readFirstJsonConfig([
    getGatewayConfigPath("project", cwd),
    getGatewayConfigPath("global", cwd),
  ]);
  const baseUrl =
    fileConfig.value?.baseUrl ??
    process.env.CODEMAP_LLM_GATEWAY_BASE_URL ??
    DEFAULT_BASE_URL;
  const apiKey =
    process.env.CODEMAP_LLM_GATEWAY_API_KEY ?? fileConfig.value?.apiKey;
  const mode =
    fileConfig.value?.mode ??
    parseMode(process.env.CODEMAP_LLM_GATEWAY_MODE) ??
    DEFAULT_MODE;
  const profiles = fileConfig.value?.profiles?.length
    ? fileConfig.value.profiles
    : buildDefaultProfiles();
  const defaultProfile =
    fileConfig.value?.defaultProfile ??
    process.env.CODEMAP_LLM_GATEWAY_DEFAULT_PROFILE ??
    profiles[0]?.id ??
    "fast";

  return {
    baseUrl: trimTrailingSlash(baseUrl),
    apiKey,
    mode,
    defaultProfile,
    profiles,
    configSource: fileConfig.source ?? (hasEnvironmentConfig() ? "environment" : "built-in defaults"),
  };
}

export async function writeGatewayConfig(
  options: WriteGatewayConfigOptions,
): Promise<{ path: string; created: boolean }> {
  const configPath = getGatewayConfigPath(options.scope, options.cwd ?? process.cwd());
  const config = buildDefaultGatewayFile({
    baseUrl: options.baseUrl,
    mode: options.mode,
  });

  try {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
      flag: options.force ? "w" : "wx",
    });
    return { path: configPath, created: true };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      return { path: configPath, created: false };
    }
    throw error;
  }
}

export function getGatewayConfigPath(scope: GatewayConfigScope, cwd = process.cwd()): string {
  if (scope === "project") return path.join(cwd, ".codemap", "llm-gateway.json");
  return path.join(homedir(), ".codemap", "llm-gateway.json");
}

export function buildDefaultGatewayFile(
  overrides: Pick<FileGatewayConfig, "baseUrl" | "mode"> = {},
): FileGatewayConfig {
  return {
    baseUrl: trimTrailingSlash(overrides.baseUrl ?? DEFAULT_BASE_URL),
    mode: overrides.mode ?? DEFAULT_MODE,
    defaultProfile: "fast",
    profiles: buildDefaultProfiles(),
  };
}

export function buildDefaultProfiles(): ModelProfile[] {
  return [
    {
      id: "fast",
      label: "Fast coding model",
      provider: "9router",
      model:
        process.env.CODEMAP_LLM_GATEWAY_FAST_MODEL ??
        process.env.CODEMAP_LLM_GATEWAY_DEFAULT_MODEL ??
        "auto:fast",
      tier: "fast",
      local: false,
    },
    {
      id: "strong",
      label: "Strong coding model",
      provider: "9router",
      model:
        process.env.CODEMAP_LLM_GATEWAY_STRONG_MODEL ??
        process.env.CODEMAP_LLM_GATEWAY_DEFAULT_MODEL ??
        "auto:strong",
      tier: "strong",
      local: false,
    },
    {
      id: "local",
      label: "Local private model",
      provider: "9router",
      model:
        process.env.CODEMAP_LLM_GATEWAY_LOCAL_MODEL ??
        process.env.CODEMAP_LLM_GATEWAY_DEFAULT_MODEL ??
        "local:auto",
      tier: "local",
      local: true,
    },
  ];
}

export function parseGatewayMode(value: string | undefined): GatewayMode | undefined {
  return parseMode(value);
}

async function readFirstJsonConfig(paths: string[]): Promise<{
  source?: string;
  value?: FileGatewayConfig;
}> {
  for (const configPath of paths) {
    if (!(await fileExists(configPath))) continue;
    const raw = await readFile(configPath, "utf8");
    return {
      source: configPath,
      value: JSON.parse(raw) as FileGatewayConfig,
    };
  }
  return {};
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseMode(value: string | undefined): GatewayMode | undefined {
  if (
    value === "hybrid" ||
    value === "local-only" ||
    value === "cloud-ok" ||
    value === "ask-before-cloud"
  ) {
    return value;
  }
  return undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function hasEnvironmentConfig(): boolean {
  return [
    "CODEMAP_LLM_GATEWAY_BASE_URL",
    "CODEMAP_LLM_GATEWAY_API_KEY",
    "CODEMAP_LLM_GATEWAY_MODE",
    "CODEMAP_LLM_GATEWAY_DEFAULT_PROFILE",
    "CODEMAP_LLM_GATEWAY_DEFAULT_MODEL",
    "CODEMAP_LLM_GATEWAY_FAST_MODEL",
    "CODEMAP_LLM_GATEWAY_STRONG_MODEL",
    "CODEMAP_LLM_GATEWAY_LOCAL_MODEL",
  ].some((key) => process.env[key]);
}
