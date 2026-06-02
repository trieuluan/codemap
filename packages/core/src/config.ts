import { homedir } from "node:os";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { findMonorepoRoot } from "./lib/monorepo-root.js";

export const DEFAULT_API_URL = "https://api.codemap.codes";

export interface McpConfigUser {
  id?: string | null;
  email?: string | null;
  name?: string | null;
}

export interface McpConfigAuth {
  method: "api_key";
  createdAt?: string;
  lastValidatedAt?: string;
}

export interface McpConfigMcpServer {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  priorityResources?: string[];
}

export interface McpConfigFile {
  apiUrl?: string | null;
  apiToken?: string | null;
  user?: McpConfigUser | null;
  auth?: McpConfigAuth | null;
  mcpServers?: Record<string, McpConfigMcpServer> | null;
}

export interface McpServerConfig {
  apiUrl: string;
  apiToken: string | null;
  user: McpConfigUser | null;
  auth: McpConfigAuth | null;
  projectConfigPath: string;
  globalConfigPath: string;
  toolMode: "lite" | "standard" | "full";
  globalMcpServers: Record<string, McpConfigMcpServer>;
}

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function normalizeConfigFile(input: unknown): McpConfigFile {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const rootRecord = input as Record<string, unknown>;
  const codemapRecord =
    rootRecord.codemap &&
    typeof rootRecord.codemap === "object" &&
    !Array.isArray(rootRecord.codemap)
      ? (rootRecord.codemap as Record<string, unknown>)
      : null;
  const record = codemapRecord ? { ...rootRecord, ...codemapRecord } : rootRecord;
  const apiUrl =
    typeof record.apiUrl === "string" && record.apiUrl.trim()
      ? record.apiUrl.trim()
      : null;
  const apiToken =
    typeof record.apiToken === "string" && record.apiToken.trim()
      ? record.apiToken.trim()
      : null;
  const userRecord =
    record.user &&
    typeof record.user === "object" &&
    !Array.isArray(record.user)
      ? (record.user as Record<string, unknown>)
      : null;
  const authRecord =
    record.auth &&
    typeof record.auth === "object" &&
    !Array.isArray(record.auth)
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
          typeof authRecord.createdAt === "string" &&
          authRecord.createdAt.trim()
            ? authRecord.createdAt.trim()
            : undefined,
        lastValidatedAt:
          typeof authRecord.lastValidatedAt === "string" &&
          authRecord.lastValidatedAt.trim()
            ? authRecord.lastValidatedAt.trim()
            : undefined,
      }
    : null;

  const mcpServersRaw =
    record.mcpServers &&
    typeof record.mcpServers === "object" &&
    !Array.isArray(record.mcpServers)
      ? (record.mcpServers as Record<string, unknown>)
      : null;
  let mcpServers: Record<string, McpConfigMcpServer> | null = null;
  if (mcpServersRaw) {
    mcpServers = {};
    for (const [name, entry] of Object.entries(mcpServersRaw)) {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const sc = entry as Record<string, unknown>;
        const server: McpConfigMcpServer = {};
        if (typeof sc.type === "string") server.type = sc.type;
        if (typeof sc.command === "string") server.command = sc.command;
        if (Array.isArray(sc.args))
          server.args = sc.args.filter(
            (a): a is string => typeof a === "string",
          );
        if (sc.env && typeof sc.env === "object" && !Array.isArray(sc.env)) {
          server.env = {};
          for (const [k, v] of Object.entries(
            sc.env as Record<string, unknown>,
          )) {
            if (typeof v === "string") server.env[k] = v;
          }
        }
        if (Array.isArray(sc.priorityResources)) {
          server.priorityResources = sc.priorityResources.filter(
            (r): r is string => typeof r === "string",
          );
        }
        mcpServers[name] = server;
      }
    }
  }

  return {
    ...(apiUrl ? { apiUrl } : {}),
    ...(apiToken ? { apiToken } : {}),
    ...(user ? { user } : {}),
    ...(auth ? { auth } : {}),
    ...(mcpServers ? { mcpServers } : {}),
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

async function findProjectRoot(cwd: string): Promise<string> {
  return findMonorepoRoot(cwd);
}

function getConfigPaths(projectRoot: string) {
  return {
    projectConfigPath: path.join(projectRoot, ".codemap", "settings.json"),
    globalConfigPath: path.join(homedir(), ".codemap", "settings.json"),
  };
}

function applyLayer(resolved: McpServerConfig, layer: McpConfigFile | null) {
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

  if (layer.apiToken != null) {
    nextResolved.apiToken = layer.apiToken;
  }

  if (layer.user != null) {
    nextResolved.user = layer.user;
  }

  if (layer.auth != null) {
    nextResolved.auth = layer.auth;
  }

  return nextResolved;
}

export async function loadConfig(
  cwd = process.cwd(),
): Promise<McpServerConfig> {
  const projectRoot = await findProjectRoot(cwd);
  const { projectConfigPath, globalConfigPath } = getConfigPaths(projectRoot);
  const [projectConfig, globalConfig] = await Promise.all([
    readConfigFile(projectConfigPath),
    readConfigFile(globalConfigPath),
  ]);

  const envConfig: McpConfigFile = {
    apiUrl: readOptionalEnv("CODEMAP_API_URL"),
    apiToken: readOptionalEnv("CODEMAP_API_KEY"),
  };

  const toolModeRaw = readOptionalEnv("CODEMAP_TOOL_MODE");
  const toolMode: McpServerConfig["toolMode"] =
    toolModeRaw === "lite" || toolModeRaw === "full" ? toolModeRaw : "standard";

  let resolved: McpServerConfig = {
    apiUrl: DEFAULT_API_URL,
    apiToken: null,
    user: null,
    auth: null,
    projectConfigPath,
    globalConfigPath,
    toolMode,
    globalMcpServers: globalConfig?.mcpServers ?? {},
  };

  resolved = applyLayer(resolved, globalConfig);
  resolved = applyLayer(resolved, projectConfig);
  resolved = applyLayer(resolved, envConfig);

  return resolved;
}

async function writeConfigFile(configPath: string, config: McpConfigFile) {
  await mkdir(path.dirname(configPath), { recursive: true });

  if (path.basename(configPath) === "settings.json") {
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
    } catch {
      existing = {};
    }

    const existingCodemap =
      existing.codemap && typeof existing.codemap === "object" && !Array.isArray(existing.codemap)
        ? (existing.codemap as Record<string, unknown>)
        : {};

    const nextConfig = {
      ...existing,
      codemap: {
        ...existingCodemap,
        apiUrl: config.apiUrl,
        apiToken: config.apiToken,
        user: config.user,
        auth: config.auth,
      },
    };

    await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
    return;
  }

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
