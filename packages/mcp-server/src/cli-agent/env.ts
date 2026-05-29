import { readFile } from "node:fs/promises";
import path from "node:path";

import { getPackageRoot } from "../lib/bundled-runtime.js";

const packageRoot = getPackageRoot(import.meta.url);

export async function loadDotEnv(cwd = process.cwd()): Promise<string[]> {
  const candidates = uniquePaths([
    path.join(cwd, ".env"),
    path.join(packageRoot, ".env"),
    path.join(packageRoot, "../..", ".env"),
  ]);
  const loaded: string[] = [];

  for (const envPath of candidates) {
    const raw = await readOptionalFile(envPath);
    if (raw === undefined) continue;
    applyEnv(raw);
    loaded.push(envPath);
  }

  return loaded;
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

function applyEnv(raw: string): void {
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    process.env[key] ??= value;
  }
}

function parseEnvLine(line: string): [string, string] | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;

  const assignment = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trim()
    : trimmed;
  const separatorIndex = assignment.indexOf("=");
  if (separatorIndex <= 0) return undefined;

  const key = assignment.slice(0, separatorIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return undefined;

  const rawValue = assignment.slice(separatorIndex + 1).trim();
  return [key, stripQuotes(rawValue)];
}

function stripQuotes(value: string): string {
  if (value.length < 2) return value;
  const quote = value[0];
  if ((quote !== "\"" && quote !== "'") || value.at(-1) !== quote) return value;
  return value.slice(1, -1);
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map((candidate) => path.resolve(candidate))));
}
