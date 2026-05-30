import { homedir } from "node:os";
import path from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";

import type { GatewayConfig } from "./types.js";

export interface FileGatewayConfig {
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
}

export type GatewayConfigScope = "project" | "global";

export interface WriteGatewayConfigOptions {
  scope: GatewayConfigScope;
  cwd?: string;
  force?: boolean;
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
}

export const DEFAULT_BASE_URL = "http://localhost:4000/v1";

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
  const defaultModel =
    fileConfig.value?.defaultModel ??
    process.env.CODEMAP_LLM_GATEWAY_DEFAULT_MODEL ??
    "coder";

  return {
    baseUrl: trimTrailingSlash(baseUrl),
    apiKey,
    defaultModel,
    models: [],
    configSource:
      fileConfig.source ??
      (hasEnvironmentConfig() ? "environment" : "built-in defaults"),
  };
}

export async function writeGatewayConfig(
  options: WriteGatewayConfigOptions,
): Promise<{ path: string; created: boolean }> {
  const configPath = getGatewayConfigPath(
    options.scope,
    options.cwd ?? process.cwd(),
  );
  const config = buildDefaultGatewayFile({ baseUrl: options.baseUrl });
  if (options.apiKey) {
    config.apiKey = options.apiKey;
  }
  if (options.defaultModel) {
    config.defaultModel = options.defaultModel;
  }

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

export function getGatewayConfigPath(
  scope: GatewayConfigScope,
  cwd = process.cwd(),
): string {
  if (scope === "project")
    return path.join(cwd, ".codemap", "llm-gateway.json");
  return path.join(homedir(), ".codemap", "llm-gateway.json");
}

export async function hasConfigOrEnvSetup(): Promise<boolean> {
  const projectPath = getGatewayConfigPath("project");
  const globalPath = getGatewayConfigPath("global");
  
  try {
    await access(projectPath);
    return true;
  } catch {
    // Check global config
  }
  
  try {
    await access(globalPath);
    return true;
  } catch {
    // Check environment
  }
  
  return hasEnvironmentConfig();
}

export function buildDefaultGatewayFile(
  overrides: Pick<FileGatewayConfig, "baseUrl"> = {},
): FileGatewayConfig {
  return {
    baseUrl: trimTrailingSlash(overrides.baseUrl ?? DEFAULT_BASE_URL),
    defaultModel: "coder",
  };
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
    "CODEMAP_LLM_GATEWAY_PLANNER_MODEL",
    "CODEMAP_LLM_GATEWAY_CODER_MODEL",
    "CODEMAP_LLM_GATEWAY_REVIEWER_MODEL",
    "CODEMAP_LLM_GATEWAY_LOCAL_MODEL",
  ].some((key) => process.env[key]);
}
