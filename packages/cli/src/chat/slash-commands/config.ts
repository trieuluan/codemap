import type { Command } from "./types.js";
import {
  loadSettings,
  writeSettings,
  getGlobalSettingsPath,
  getProjectSettingsPath,
  type SettingsFile,
  type SettingsScope,
} from "@codemap-ai/runtime-node/settings";

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const C_CYAN = `${BOLD}\x1b[38;2;0;229;255m`;
const C_GREEN = "\x1b[38;2;34;197;94m";
const C_YELLOW = "\x1b[38;2;250;204;21m";
const C_RED = "\x1b[38;2;239;68;68m";
const C_GRAY = "\x1b[38;2;107;114;128m";
const C_WHITE = "\x1b[38;2;229;231;235m";

export const configCommand: Command = {
  name: "config",
  description: "Show, get, or set configuration values",
  execute: async (args, ctx) => {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];

    if (!sub || sub === "show") {
      return showConfig(ctx);
    }

    if (sub === "get") {
      return getConfig(parts.slice(1), ctx);
    }

    if (sub === "set") {
      return setConfig(parts.slice(1), ctx);
    }

    if (sub === "edit") {
      return editConfig(parts.slice(1), ctx);
    }

    if (sub === "paths") {
      return showPaths(ctx);
    }

    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `${BOLD}Usage:${RESET}`,
          "  /config                   Show all settings (merged)",
          "  /config show              Same as above",
          "  /config get <key>         Get a specific setting value",
          "  /config set <key> <val>   Set a project-level setting",
          "  /config set --global <key> <val>  Set a global setting",
          "  /config edit [--global]   Open settings.json in $EDITOR",
          "  /config paths             Show config file locations",
          "",
          `${BOLD}Keys:${RESET}`,
          `  ${C_CYAN}gateway.provider${RESET}        LLM provider (9router, openai, anthropic, …)`,
          `  ${C_CYAN}gateway.baseUrl${RESET}         Gateway base URL`,
          `  ${C_CYAN}gateway.apiKey${RESET}          Gateway API key`,
          `  ${C_CYAN}gateway.defaultModel${RESET}    Default model ID`,
          `  ${C_CYAN}gateway.modeDefaults.build${RESET}  Build-mode model`,
          `  ${C_CYAN}gateway.modeDefaults.plan${RESET}   Plan-mode model`,
          `  ${C_CYAN}gateway.modeDefaults.fast${RESET}   Fast-mode model`,
          `  ${C_CYAN}theme${RESET}                   Terminal theme name`,
        ].join("\n"),
      },
    ]);
  },
};

// ─── /config show ───────────────────────────────────────────────

async function showConfig(ctx: Parameters<Command["execute"]>[1]) {
  const globalPath = getGlobalSettingsPath();
  const projectPath = await getProjectSettingsPath();

  const [globalSettings, projectSettings] = await Promise.all([
    readJsonFile<SettingsFile>(globalPath),
    readJsonFile<SettingsFile>(projectPath),
  ]);

  const merged = await loadSettings();

  const lines: string[] = [
    `${BOLD}Configuration${RESET}`,
    "",
  ];

  // Gateway section
  const gw = merged.gateway ?? {};
  lines.push(`${C_CYAN}${BOLD}Gateway${RESET}`);
  lines.push(formatRow("provider", gw.provider ?? "9router", resolveSource("gateway.provider", globalSettings, projectSettings)));
  lines.push(formatRow("baseUrl", gw.baseUrl ?? "http://localhost:4000/v1", resolveSource("gateway.baseUrl", globalSettings, projectSettings)));
  lines.push(formatRow("apiKey", gw.apiKey ? mask(gw.apiKey) : `${C_GRAY}(not set)${RESET}`, resolveSource("gateway.apiKey", globalSettings, projectSettings)));
  lines.push(formatRow("defaultModel", gw.defaultModel ?? "coder", resolveSource("gateway.defaultModel", globalSettings, projectSettings)));
  lines.push("");

  // Mode defaults
  const modes = gw.modeDefaults ?? {};
  lines.push(`${C_CYAN}${BOLD}Mode Defaults${RESET}`);
  lines.push(formatRow("build", modes.build ?? "coder", resolveSource("gateway.modeDefaults.build", globalSettings, projectSettings)));
  lines.push(formatRow("plan", modes.plan ?? "gpt-5", resolveSource("gateway.modeDefaults.plan", globalSettings, projectSettings)));
  lines.push(formatRow("fast", modes.fast ?? "gpt-5-mini", resolveSource("gateway.modeDefaults.fast", globalSettings, projectSettings)));
  lines.push("");

  // Theme
  lines.push(`${C_CYAN}${BOLD}Appearance${RESET}`);
  lines.push(formatRow("theme", merged.theme ?? "codemap-dark", resolveSource("theme", globalSettings, projectSettings)));
  lines.push("");

  // MCP servers
  const serverCount = Object.keys(merged.mcpServers ?? {}).length;
  lines.push(`${C_CYAN}${BOLD}MCP Servers${RESET}`);
  lines.push(formatRow("count", String(serverCount), serverCount > 0 ? "config" : "default"));
  lines.push("");

  // Config file paths
  lines.push(`${C_GRAY}Project config: ${projectPath}${RESET}`);
  lines.push(`${C_GRAY}Global config:  ${globalPath}${RESET}`);

  ctx.setMessages((prev) => [...prev, { role: "system", content: lines.join("\n") }]);
}

// ─── /config get <key> ──────────────────────────────────────────

async function getConfig(
  args: string[],
  ctx: Parameters<Command["execute"]>[1],
) {
  const key = args[0];
  if (!key) {
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: `${C_RED}Usage:${RESET} /config get <key>` },
    ]);
    return;
  }

  const merged = await loadSettings();
  const value = resolveKeyValue(merged, key);

  if (value === undefined) {
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: `${C_YELLOW}${key}${RESET} = ${C_GRAY}(not set)${RESET}` },
    ]);
    return;
  }

  const display = key.includes("apiKey") || key.includes("apiToken")
    ? mask(String(value))
    : String(value);

  ctx.setMessages((prev) => [
    ...prev,
    { role: "system", content: `${C_CYAN}${key}${RESET} = ${C_WHITE}${display}${RESET}` },
  ]);
}

// ─── /config set <key> <value> [--global] ───────────────────────

async function setConfig(
  args: string[],
  ctx: Parameters<Command["execute"]>[1],
) {
  // Parse --global flag
  let isGlobal = false;
  const filtered: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--global" || args[i] === "-g") {
      isGlobal = true;
    } else {
      filtered.push(args[i]!);
    }
  }

  const key = filtered[0];
  const value = filtered.slice(1).join(" ");

  if (!key || !value) {
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: `${C_RED}Usage:${RESET} /config set [--global] <key> <value>\nExample: /config set gateway.defaultModel gpt-5`,
      },
    ]);
    return;
  }

  const scope: SettingsScope = isGlobal ? "global" : "project";
  const scopeLabel = isGlobal ? "global" : "project";

  // Validate key
  if (!isValidConfigKey(key)) {
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `${C_RED}Unknown key:${RESET} "${key}"`,
          "",
          `${BOLD}Valid keys:${RESET}`,
          ...CONFIG_KEYS.map((k) => `  ${C_CYAN}${k}${RESET}`),
        ].join("\n"),
      },
    ]);
    return;
  }

  try {
    // Build a patch object from the dotted key path
    const patch = buildPatchFromKey(key, value);
    await writeSettings(scope, patch);
    const path = scope === "project" ? await getProjectSettingsPath() : getGlobalSettingsPath();

    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: `${C_GREEN}Set${RESET} ${C_CYAN}${key}${RESET} = ${C_WHITE}${key.includes("apiKey") ? mask(value) : value}${RESET} ${C_GRAY}(${scopeLabel}: ${path})${RESET}`,
      },
    ]);
  } catch (err) {
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: `${C_RED}Failed to set config:${RESET} ${err instanceof Error ? err.message : String(err)}`,
      },
    ]);
  }
}

// ─── /config edit [--global] ────────────────────────────────────

async function editConfig(
  args: string[],
  ctx: Parameters<Command["execute"]>[1],
) {
  const isGlobal = args.includes("--global") || args.includes("-g");
  const filePath = isGlobal ? getGlobalSettingsPath() : await getProjectSettingsPath();
  const scopeLabel = isGlobal ? "global" : "project";

  // Check if editor is available
  const editor = process.env.EDITOR ?? process.env.VISUAL;
  if (!editor) {
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `${C_YELLOW}No $EDITOR set.${RESET}`,
          `Config file: ${filePath}`,
          "",
          `Set your editor: export EDITOR=vim`,
          `Or edit manually: open ${filePath}`,
        ].join("\n"),
      },
    ]);
    return;
  }

  ctx.setMessages((prev) => [
    ...prev,
    {
      role: "system",
      content: `${C_GRAY}Opening ${scopeLabel} config in ${editor}...${RESET}\n${C_GRAY}${filePath}${RESET}\n${C_GRAY}After saving, use /config show to see changes.${RESET}`,
    },
  ]);

  // We can't actually open the editor from within the TUI,
  // so we just show the path and instructions
}

// ─── /config paths ──────────────────────────────────────────────

async function showPaths(ctx: Parameters<Command["execute"]>[1]) {
  const globalPath = getGlobalSettingsPath();
  const projectPath = await getProjectSettingsPath();

  const lines = [
    `${BOLD}Config Paths${RESET}`,
    "",
    `  ${C_CYAN}Project${RESET}  ${projectPath}`,
    `  ${C_CYAN}Global${RESET}   ${globalPath}`,
    "",
    `${C_GRAY}Merge order: defaults ← global ← project ← env vars${RESET}`,
  ];

  ctx.setMessages((prev) => [...prev, { role: "system", content: lines.join("\n") }]);
}

// ─── Helpers ────────────────────────────────────────────────────

const CONFIG_KEYS = [
  "gateway.provider",
  "gateway.baseUrl",
  "gateway.apiKey",
  "gateway.defaultModel",
  "gateway.modeDefaults.build",
  "gateway.modeDefaults.plan",
  "gateway.modeDefaults.fast",
  "theme",
];

function isValidConfigKey(key: string): boolean {
  return CONFIG_KEYS.includes(key);
}

function resolveKeyValue(settings: SettingsFile, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = settings;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveSource(
  key: string,
  globalSettings: SettingsFile | null,
  projectSettings: SettingsFile | null,
): string {
  const projectValue = projectSettings ? resolveKeyValue(projectSettings, key) : undefined;
  if (projectValue !== undefined) return "project";

  const globalValue = globalSettings ? resolveKeyValue(globalSettings, key) : undefined;
  if (globalValue !== undefined) return "global";

  // Check env
  const envKey = keyToEnvVar(key);
  if (envKey && process.env[envKey]) return "env";

  return "default";
}

function keyToEnvVar(key: string): string | null {
  const map: Record<string, string> = {
    "gateway.provider": "CODEMAP_LLM_GATEWAY_PROVIDER",
    "gateway.baseUrl": "CODEMAP_LLM_GATEWAY_BASE_URL",
    "gateway.apiKey": "CODEMAP_LLM_GATEWAY_API_KEY",
    "gateway.defaultModel": "CODEMAP_LLM_GATEWAY_DEFAULT_MODEL",
    "gateway.modeDefaults.build": "CODEMAP_LLM_GATEWAY_BUILD_MODEL",
    "gateway.modeDefaults.plan": "CODEMAP_LLM_GATEWAY_PLAN_MODEL",
    "gateway.modeDefaults.fast": "CODEMAP_LLM_GATEWAY_FAST_MODEL",
  };
  return map[key] ?? null;
}

function buildPatchFromKey(key: string, value: string): SettingsFile {
  const parts = key.split(".");
  const patch: Record<string, unknown> = {};
  let current = patch;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    current[part] = {};
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;

  // Parse value types
  if (lastPart === "apiKey" && value === "") {
    current[lastPart] = undefined;
  } else {
    current[lastPart] = value;
  }

  return patch as SettingsFile;
}

function mask(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}${"*".repeat(value.length - 8)}${value.slice(-4)}`;
}

function formatRow(key: string, value: string, source: string): string {
  const sourceColor =
    source === "project"
      ? C_GREEN
      : source === "global"
        ? C_YELLOW
        : source === "env"
          ? C_CYAN
          : C_GRAY;
  return `  ${C_GRAY}${key.padEnd(16)}${RESET} ${C_WHITE}${value}${RESET} ${sourceColor}${source}${RESET}`;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
