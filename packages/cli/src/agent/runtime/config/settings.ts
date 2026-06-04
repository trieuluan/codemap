import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { GatewayProviderId } from "../../types.js";
import { stripProviderPrefix } from "./models.js";

export type MastraProviderId = GatewayProviderId;

export interface MastraSettingsOptions {
  provider?: MastraProviderId;
  baseUrl: string;
  apiKey: string | undefined;
  availableModels?: string[];
  modeDefaults?: { build?: string; plan?: string; fast?: string };
}

export async function upsertGlobalMastraProvider(
  opts: MastraSettingsOptions,
  harnessModelId: string,
): Promise<string> {
  const settingsPath = getMastraGlobalSettingsPath();
  const settings = await readJsonObject(settingsPath);
  const providerId = opts.provider ?? "9router";

  const rawProviders = Array.isArray(settings.customProviders)
    ? settings.customProviders.filter((provider) => {
        const name = typeof provider === "object" && provider !== null
          ? (provider as Record<string, unknown>).name
          : undefined;
        return getCustomProviderId(typeof name === "string" ? name : "") !== providerId;
      })
    : [];

  if (providerId === "openai") {
    settings.customProviders = rawProviders;
  } else {
    settings.customProviders = [
      ...rawProviders,
      {
        name: providerId,
        url: opts.baseUrl,
        ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
        models: getRawModels(opts, harnessModelId),
      },
    ];
  }

  settings.onboarding = {
    ...(settings.onboarding && typeof settings.onboarding === "object" ? settings.onboarding : {}),
    completedAt: new Date().toISOString(),
  };

  // Write modeDefaults so mastracode picks up the right model per mode
  if (opts.modeDefaults || harnessModelId) {
    const prefix = providerId === "openai" ? "openai" : providerId;
    const addPrefix = (id: string): string => {
      return id.includes("/") ? id : `${prefix}/${id}`;
    };
    const existingModels =
      settings.models && typeof settings.models === "object" && !Array.isArray(settings.models)
        ? (settings.models as Record<string, unknown>)
        : {};
    const modeDefaults: Record<string, string> = {};
    const buildModel = opts.modeDefaults?.build ?? harnessModelId;
    const planModel = opts.modeDefaults?.plan;
    const fastModel = opts.modeDefaults?.fast;
    if (buildModel) modeDefaults.build = addPrefix(buildModel);
    if (planModel) modeDefaults.plan = addPrefix(planModel);
    if (fastModel) modeDefaults.fast = addPrefix(fastModel);
    settings.models = {
      ...existingModels,
      modeDefaults,
    };
  }

  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return settingsPath;
}

function getRawModels(opts: MastraSettingsOptions, harnessModelId: string): string[] {
  const providerId = opts.provider ?? "9router";
  return Array.from(new Set([
    stripProviderPrefix(harnessModelId, providerId),
    ...(opts.availableModels ?? []).map((id) => stripProviderPrefix(id, providerId)),
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
