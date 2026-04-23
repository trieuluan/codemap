import { homedir } from "node:os";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

export const DEFAULT_API_URL = "https://api.codemap.dev";

export interface McpConfigUser {
  id?: string;
  email?: string;
  name?: string;
}

export interface McpConfigAuth {
  method: "api_key";
  createdAt?: string;
  lastValidatedAt?: string;
}

export interface McpConfigFile {
  apiUrl?: string | null;
  apiToken?: string | null;
  user?: McpConfigUser | null;
  auth?: McpConfigAuth | null;
}

export interface McpServerConfig {
  apiUrl: string;
  apiToken: string | null;
  user: McpConfigUser | null;
  auth: McpConfigAuth | null;
  projectConfigPath: string;
  globalConfigPath: string;
}

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function normalizeConfigFile(input: unknown): McpConfigFile {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const record = input as Record<string, unknown>;
  const apiUrl =
    typeof record.apiUrl === "string" && record.apiUrl.trim()
      ? record.apiUrl.trim()
      : null;
  const apiToken =
    typeof record.apiToken === "string" && record.apiToken.trim()
      ? record.apiToken.trim()
      : null;
  const userRecord =
    record.user && typeof record.user === "object" && !Array.isArray(record.user)
      ? (record.user as Record<string, unknown>)
      : null;
  const authRecord =
    record.auth && typeof record.auth === "object" && !Array.isArray(record.auth)
      ? (record.auth as Record<string, unknown>)
      : null;
  const user = userRecord
    ? {
        id:
          typeof userRecord.id === "string" && userRecord.id.trim()
            ? userRecord.id.trim()
            : undefined,
        email:
          typeof userRecord.email === "string" && userRecord.email.trim()
            ? userRecord.email.trim()
            : undefined,
        name:
          typeof userRecord.name === "string" && userRecord.name.trim()
            ? userRecord.name.trim()
            : undefined,
      }
    : null;
  const auth = authRecord
    ? {
        method: "api_key" as const,
        createdAt:
          typeof authRecord.createdAt === "string" && authRecord.createdAt.trim()
            ? authRecord.createdAt.trim()
            : undefined,
        lastValidatedAt:
          typeof authRecord.lastValidatedAt === "string" &&
          authRecord.lastValidatedAt.trim()
            ? authRecord.lastValidatedAt.trim()
            : undefined,
      }
    : null;

  return {
    ...(apiUrl ? { apiUrl } : {}),
    ...(apiToken ? { apiToken } : {}),
    ...(user ? { user } : {}),
    ...(auth ? { auth } : {}),
  };
}

async function readConfigFile(configPath: string) {
  try {
    const rawContent = await readFile(configPath, "utf8");
    return normalizeConfigFile(JSON.parse(rawContent));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

function getConfigPaths(cwd = process.cwd()) {
  return {
    projectConfigPath: path.join(cwd, ".codemap", "mcp.json"),
    globalConfigPath: path.join(homedir(), ".codemap", "mcp.json"),
  };
}

function applyLayer(
  resolved: McpServerConfig,
  layer: McpConfigFile | null,
) {
  if (!layer) {
    return resolved;
  }

  const nextResolved = { ...resolved };
  const nextApiUrl = layer.apiUrl?.trim() || null;

  if (nextApiUrl && nextApiUrl !== nextResolved.apiUrl) {
    nextResolved.apiUrl = nextApiUrl;

    if (!layer.apiToken) {
      nextResolved.apiToken = null;
      nextResolved.user = null;
      nextResolved.auth = null;
    }
  }

  if (layer.apiToken !== undefined) {
    nextResolved.apiToken = layer.apiToken ?? null;
  }

  if (layer.user !== undefined) {
    nextResolved.user = layer.user ?? null;
  }

  if (layer.auth !== undefined) {
    nextResolved.auth = layer.auth ?? null;
  }

  return nextResolved;
}

export async function loadConfig(cwd = process.cwd()): Promise<McpServerConfig> {
  const { projectConfigPath, globalConfigPath } = getConfigPaths(cwd);
  const [projectConfig, globalConfig] = await Promise.all([
    readConfigFile(projectConfigPath),
    readConfigFile(globalConfigPath),
  ]);

  const envConfig: McpConfigFile = {
    apiUrl: readOptionalEnv("API_URL"),
    apiToken: readOptionalEnv("API_TOKEN"),
  };

  let resolved: McpServerConfig = {
    apiUrl: DEFAULT_API_URL,
    apiToken: null,
    user: null,
    auth: null,
    projectConfigPath,
    globalConfigPath,
  };

  resolved = applyLayer(resolved, envConfig);
  resolved = applyLayer(resolved, globalConfig);
  resolved = applyLayer(resolved, projectConfig);

  return resolved;
}

async function writeConfigFile(configPath: string, config: McpConfigFile) {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function saveGlobalConfig(
  config: Pick<McpServerConfig, "globalConfigPath"> & McpConfigFile,
) {
  await writeConfigFile(config.globalConfigPath, {
    apiUrl: config.apiUrl,
    apiToken: config.apiToken,
    user: config.user,
    auth: config.auth,
  });
}

export async function clearGlobalAuthConfig(
  config: Pick<McpServerConfig, "globalConfigPath">,
) {
  const existingConfig = await readConfigFile(config.globalConfigPath);

  if (!existingConfig) {
    return;
  }

  const nextConfig: McpConfigFile = {
    apiUrl: existingConfig.apiUrl ?? null,
  };

  await writeConfigFile(config.globalConfigPath, nextConfig);
}

export async function removeGlobalConfig(
  config: Pick<McpServerConfig, "globalConfigPath">,
) {
  await rm(config.globalConfigPath, { force: true });
}
