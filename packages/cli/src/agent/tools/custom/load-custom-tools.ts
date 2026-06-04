/**
 * Custom tools loader.
 *
 * Discovers and loads custom tool descriptors from `.codemap/tools/` directories.
 * Project tools override global tools with the same name.
 *
 * Directory layout:
 *   .codemap/tools/
 *     deploy.tool.json        — tool descriptor
 *     deploy.run.ts           — optional script (kind="script")
 *     scripts/
 *       deploy-helper.ts      — shared scripts
 */

import { readdir, readFile, stat, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type {
  CustomToolDescriptor,
  CustomToolKind,
  ResolvedCustomTool,
  CustomToolSource,
} from "./custom-tools-types.js";

const TOOLS_DIR_NAME = "tools";
const DESCRIPTOR_EXT = ".tool.json";

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Resolve global tools dir: ~/.codemap/tools/ */
function getGlobalToolsDir(): string {
  return join(homedir(), ".codemap", TOOLS_DIR_NAME);
}

/** Resolve project tools dir: <workspaceRoot>/.codemap/tools/ */
function getProjectToolsDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".codemap", TOOLS_DIR_NAME);
}

/**
 * Read and validate a single tool descriptor file.
 * Returns null if the file is invalid (logs warning).
 */
async function readDescriptor(
  filePath: string,
  source: CustomToolSource,
  toolsDir: string,
): Promise<ResolvedCustomTool | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (!parsed.name || typeof parsed.name !== "string") {
      console.warn(`[custom-tools] skipping ${filePath}: missing "name" field`);
      return null;
    }

    if (!parsed.description || typeof parsed.description !== "string") {
      console.warn(`[custom-tools] skipping ${filePath}: missing "description" field`);
      return null;
    }

    const kind = parsed.kind as CustomToolKind | undefined;
    if (!kind || !["command", "http", "script"].includes(kind)) {
      console.warn(`[custom-tools] skipping ${filePath}: invalid "kind" (must be command|http|script)`);
      return null;
    }

    // Validate kind-specific fields
    if (kind === "command" && !parsed.command) {
      console.warn(`[custom-tools] skipping ${filePath}: kind="command" requires "command" field`);
      return null;
    }
    if (kind === "http" && !parsed.url) {
      console.warn(`[custom-tools] skipping ${filePath}: kind="http" requires "url" field`);
      return null;
    }
    if (kind === "script" && !parsed.script) {
      console.warn(`[custom-tools] skipping ${filePath}: kind="script" requires "script" field`);
      return null;
    }

    const descriptor: CustomToolDescriptor = {
      name: parsed.name,
      description: parsed.description,
      kind,
      command: parsed.command as string | undefined,
      url: parsed.url as string | undefined,
      method: parsed.method as string | undefined,
      script: parsed.script as string | undefined,
      parameters: parsed.parameters as Record<string, unknown> | undefined,
      timeoutSeconds: parsed.timeoutSeconds as number | undefined,
      env: parsed.env as Record<string, string> | undefined,
    };

    return {
      name: descriptor.name,
      description: descriptor.description,
      kind: descriptor.kind,
      source,
      descriptor,
      toolsDir,
    };
  } catch (err) {
    console.warn(`[custom-tools] failed to read ${filePath}: ${err}`);
    return null;
  }
}

/**
 * Discover all `.tool.json` files in a directory.
 * Returns empty array if dir doesn't exist.
 */
async function discoverTools(
  toolsDir: string,
  source: CustomToolSource,
): Promise<ResolvedCustomTool[]> {
  if (!(await pathExists(toolsDir))) return [];

  const entries = await readdir(toolsDir);
  const descriptors: ResolvedCustomTool[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(DESCRIPTOR_EXT)) continue;
    const filePath = join(toolsDir, entry);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) continue;

    const tool = await readDescriptor(filePath, source, toolsDir);
    if (tool) descriptors.push(tool);
  }

  return descriptors;
}

/**
 * Load all custom tools from both global and project directories.
 * Project tools override global tools with the same name.
 *
 * Returns both the resolved tools array and a Mastra-compatible extraTools record.
 */
export async function loadCustomTools(
  workspaceRoot: string,
): Promise<{
  tools: ResolvedCustomTool[];
  mastraTools: Record<string, unknown>;
}> {
  const globalDir = getGlobalToolsDir();
  const projectDir = getProjectToolsDir(workspaceRoot);

  const [globalTools, projectTools] = await Promise.all([
    discoverTools(globalDir, "global"),
    discoverTools(projectDir, "project"),
  ]);

  // Project tools override global tools with same name
  const toolMap = new Map<string, ResolvedCustomTool>();
  for (const tool of globalTools) toolMap.set(tool.name, tool);
  for (const tool of projectTools) toolMap.set(tool.name, tool);

  const tools = Array.from(toolMap.values());

  // Convert to Mastra-compatible extraTools record
  const mastraTools: Record<string, unknown> = {};
  for (const tool of tools) {
    mastraTools[tool.name] = buildMastraTool(tool);
  }

  return { tools, mastraTools };
}

/**
 * Build a Mastra-compatible tool object from a resolved custom tool.
 */
function buildMastraTool(tool: ResolvedCustomTool): Record<string, unknown> {
  const { descriptor } = tool;

  return {
    description: `${descriptor.description} [custom ${descriptor.kind} tool]`,
    parameters: descriptor.parameters ?? {
      type: "object",
      properties: {
        input: { type: "string", description: "Input for the tool" },
      },
    },
    execute: async (input: Record<string, unknown>) => {
      return executeCustomTool(tool, input);
    },
  };
}

/**
 * Execute a custom tool based on its kind.
 */
async function executeCustomTool(
  tool: ResolvedCustomTool,
  input: Record<string, unknown>,
): Promise<string> {
  const { descriptor, toolsDir } = tool;
  const timeout = (descriptor.timeoutSeconds ?? 30) * 1000;

  switch (descriptor.kind) {
    case "command":
      return executeCommand(descriptor, input, timeout);
    case "http":
      return executeHttp(descriptor, input, timeout);
    case "script":
      return executeScript(descriptor, toolsDir, input, timeout);
    default:
      return `Error: unknown tool kind: ${descriptor.kind}`;
  }
}

/** Execute a command tool */
async function executeCommand(
  descriptor: CustomToolDescriptor,
  input: Record<string, unknown>,
  timeout: number,
): Promise<string> {
  const cmd = interpolateTemplate(descriptor.command!, input);

  const { execSync } = await import("node:child_process");

  try {
    const result = execSync(cmd, {
      timeout,
      encoding: "utf8",
      maxBuffer: 1024 * 1024, // 1MB
      env: { ...process.env, ...descriptor.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string; status?: number };
    return `Error (exit ${e.status ?? "unknown"}): ${e.stderr ?? e.message ?? "command failed"}`;
  }
}

/** Execute an HTTP tool */
async function executeHttp(
  descriptor: CustomToolDescriptor,
  input: Record<string, unknown>,
  timeout: number,
): Promise<string> {
  const url = interpolateTemplate(descriptor.url!, input);
  const method = descriptor.method?.toUpperCase() ?? "GET";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const opts: RequestInit = { method, signal: controller.signal };
    if (method !== "GET" && input.body) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
    }

    const resp = await fetch(url, opts);
    const text = await resp.text();

    if (!resp.ok) {
      return `HTTP ${resp.status}: ${text.slice(0, 500)}`;
    }
    return text.slice(0, 5000); // Cap response size
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    if (e.name === "AbortError") return `Error: request timed out after ${descriptor.timeoutSeconds ?? 30}s`;
    return `Error: ${e.message ?? "request failed"}`;
  } finally {
    clearTimeout(timer);
  }
}

/** Execute a script tool */
async function executeScript(
  descriptor: CustomToolDescriptor,
  toolsDir: string,
  input: Record<string, unknown>,
  timeout: number,
): Promise<string> {
  const scriptPath = resolve(toolsDir, descriptor.script!);

  if (!(await pathExists(scriptPath))) {
    return `Error: script not found: ${scriptPath}`;
  }

  // Dynamic import the script module
  try {
    const mod = await import(scriptPath);
    const handler = mod.default ?? mod.execute ?? mod.run;

    if (typeof handler !== "function") {
      return `Error: script ${descriptor.script} must export a default function, execute(), or run()`;
    }

    const result = await Promise.race([
      handler(input),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("script timed out")), timeout),
      ),
    ]);

    return typeof result === "string" ? result : JSON.stringify(result);
  } catch (err: unknown) {
    return `Error: ${(err as Error).message ?? "script execution failed"}`;
  }
}

/**
 * Interpolate {{placeholders}} in a template string.
 * Special placeholder: {{input}} → JSON-stringified input.
 * All other placeholders: {{key}} → input[key] (stringified).
 */
function interpolateTemplate(template: string, input: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (key === "input") {
      return typeof input === "string" ? input : JSON.stringify(input);
    }
    const val = input[key];
    if (val === undefined) return "";
    return typeof val === "string" ? val : JSON.stringify(val);
  });
}

/**
 * Get the paths where custom tools are loaded from.
 * Useful for the /tools command to show tool locations.
 */
export function getCustomToolPaths(workspaceRoot: string): {
  global: string;
  project: string;
} {
  return {
    global: getGlobalToolsDir(),
    project: getProjectToolsDir(workspaceRoot),
  };
}
