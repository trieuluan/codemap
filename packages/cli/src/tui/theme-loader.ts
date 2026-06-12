import { access, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { CODEMAP_DARK_THEME, type PartialTerminalColorTheme, setTheme } from "./theme.js";
import { loadSettings } from "@codemap-ai/runtime-node/settings";

export interface ThemeLoadOptions {
  cwd?: string;
  themeName?: string;
}

export interface ThemeLoadResult {
  themeName: string;
  source: string;
}

export async function loadTerminalTheme(options: ThemeLoadOptions = {}): Promise<ThemeLoadResult> {
  // Priority: explicit option > env var > settings.json > built-in default
  const settings = await loadSettings(options.cwd);
  const selectedTheme = options.themeName
    ?? process.env.CODEMAP_THEME
    ?? settings.theme
    ?? CODEMAP_DARK_THEME.name;

  if (selectedTheme === CODEMAP_DARK_THEME.name) {
    setTheme(CODEMAP_DARK_THEME);
    return { themeName: CODEMAP_DARK_THEME.name, source: "built-in" };
  }

  const themePath = await findThemeFile(selectedTheme, options.cwd ?? process.cwd());
  if (!themePath) {
    setTheme(CODEMAP_DARK_THEME);
    return { themeName: CODEMAP_DARK_THEME.name, source: "built-in" };
  }

  const raw = await readFile(themePath, "utf8");
  const theme = JSON.parse(raw) as PartialTerminalColorTheme;
  const loaded = setTheme({ ...theme, name: theme.name ?? selectedTheme });
  return { themeName: loaded.name, source: themePath };
}

export async function findThemeFile(themeName: string, cwd = process.cwd()): Promise<string | undefined> {
  if (themeName.endsWith(".json") || themeName.includes(path.sep)) {
    return (await fileExists(themeName)) ? themeName : undefined;
  }

  for (const dir of getThemeDirectories(cwd)) {
    const filePath = path.join(dir, `${themeName}.json`);
    if (await fileExists(filePath)) return filePath;
  }

  return undefined;
}

export async function listTerminalThemes(cwd = process.cwd()): Promise<string[]> {
  const themes = new Set<string>([CODEMAP_DARK_THEME.name]);
  for (const dir of getThemeDirectories(cwd)) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".json")) {
          themes.add(entry.name.slice(0, -".json".length));
        }
      }
    } catch {
      // Missing theme directories are expected.
    }
  }
  return [...themes].sort();
}

function getThemeDirectories(cwd: string): string[] {
  return [
    path.join(cwd, ".codemap", "themes"),
    path.join(homedir(), ".codemap", "themes"),
  ];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
