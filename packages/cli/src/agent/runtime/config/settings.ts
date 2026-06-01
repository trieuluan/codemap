import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { stripNineRouterPrefix } from "./models.js";

export interface MastraSettingsOptions {
  baseUrl: string;
  apiKey: string | undefined;
  availableModels?: string[];
}

export async function createManagedMastraSettings(
  opts: MastraSettingsOptions,
  harnessModelId: string,
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "codemap-mastra-"));
  const settingsPath = path.join(dir, "settings.json");
  const rawModels = getRawModels(opts, harnessModelId);
  const modeDefaults = {
    build: harnessModelId,
    plan: harnessModelId,
    fast: harnessModelId,
  };

  await writeFile(settingsPath, JSON.stringify({
    onboarding: {
      completedAt: new Date().toISOString(),
      modePackId: null,
      omPackId: null,
    },
    models: {
      activeModelPackId: null,
      modeDefaults,
      subagentModels: {},
    },
    customProviders: [{
      name: "9router",
      url: opts.baseUrl,
      ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
      models: rawModels,
    }],
    customModelPacks: [{
      name: "codemap-9router",
      models: modeDefaults,
      createdAt: new Date().toISOString(),
    }],
    preferences: {
      yolo: false,
      thinkingLevel: "medium",
      quietMode: false,
    },
  }, null, 2), "utf8");

  return settingsPath;
}

export async function upsertGlobalMastraProvider(
  opts: MastraSettingsOptions,
  harnessModelId: string,
): Promise<string> {
  const settingsPath = getMastraGlobalSettingsPath();
  const settings = await readJsonObject(settingsPath);
  const rawProviders = Array.isArray(settings.customProviders)
    ? settings.customProviders.filter((provider) => {
        const name = typeof provider === "object" && provider !== null
          ? (provider as Record<string, unknown>).name
          : undefined;
        return getCustomProviderId(typeof name === "string" ? name : "") !== "9router";
      })
    : [];

  settings.customProviders = [
    ...rawProviders,
    {
      name: "9router",
      url: opts.baseUrl,
      ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
      models: getRawModels(opts, harnessModelId),
    },
  ];

  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return settingsPath;
}

function getRawModels(opts: MastraSettingsOptions, harnessModelId: string): string[] {
  return Array.from(new Set([
    stripNineRouterPrefix(harnessModelId),
    ...(opts.availableModels ?? []),
  ].filter(Boolean)));
}

function getMastraGlobalSettingsPath(): string {
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Application Support", "mastracode", "settings.json");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"), "mastracode", "settings.json");
  }
  return path.join(process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local", "share"), "mastracode", "settings.json");
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function getCustomProviderId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "provider";
}
