import { constants } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AGENT_PACK_SKILLS,
  getPluginRoot,
  getAgentPackRoot,
  readAgentPackFile,
  readAgentPackSkill,
} from "./agent-pack.js";

type InstallTarget =
  | "codex"
  | "claude"
  | "cursor"
  | "gemini"
  | "opencode"
  | "copilot"
  | "marketplace"
  | "all";

export interface AgentPackInstallOptions {
  target: InstallTarget;
  cwd?: string;
  dryRun?: boolean;
  force?: boolean;
  pluginPath?: string;
}

interface PlannedWrite {
  path: string;
  content?: string;
  sourcePath?: string;
}

function parseTarget(value: string | undefined): InstallTarget {
  if (
    value === "codex" ||
    value === "claude" ||
    value === "cursor" ||
    value === "gemini" ||
    value === "opencode" ||
    value === "copilot" ||
    value === "marketplace" ||
    value === "all"
  ) {
    return value;
  }
  return "all";
}

export function parseAgentPackInstallArgs(args: string[]) {
  let target: InstallTarget = "all";
  let dryRun = false;
  let force = false;
  let pluginPath: string | undefined;
  let cwd: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--target") {
      target = parseTarget(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--plugin-path" || arg === "--path") {
      pluginPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--root" || arg === "--cwd") {
      cwd = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--target=")) {
      target = parseTarget(arg.slice("--target=".length));
      continue;
    }
    if (arg.startsWith("--plugin-path=")) {
      pluginPath = arg.slice("--plugin-path=".length);
      continue;
    }
    if (arg.startsWith("--path=")) {
      pluginPath = arg.slice("--path=".length);
      continue;
    }
    if (arg.startsWith("--root=")) {
      cwd = arg.slice("--root=".length);
      continue;
    }
    if (arg.startsWith("--cwd=")) {
      cwd = arg.slice("--cwd=".length);
    }
  }

  return { target, dryRun, force, pluginPath, cwd };
}

function targetsFor(target: InstallTarget): Array<Exclude<InstallTarget, "all">> {
  return target === "all"
    ? ["codex", "claude", "cursor", "gemini", "opencode", "copilot"]
    : [target];
}

async function exists(filePath: string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function listSkillWrites(root: string, harness: "claude" | "codex"): Promise<PlannedWrite[]> {
  return Promise.all(
    AGENT_PACK_SKILLS.map(async (skill) => ({
      path: path.join(root, `.${harness}`, "skills", `codemap-${skill}`, "SKILL.md"),
      content: await readAgentPackSkill(skill),
    })),
  );
}

async function planCodex(root: string): Promise<PlannedWrite[]> {
  return [
    {
      path: path.join(root, "AGENTS.md"),
      content: await readAgentPackFile("templates/AGENTS.md"),
    },
    {
      path: path.join(root, ".codex", "codemap-agent-pack.md"),
      content: await readAgentPackFile("README.md"),
    },
    ...(await listSkillWrites(root, "codex")),
  ];
}

async function planClaude(root: string): Promise<PlannedWrite[]> {
  return [
    {
      path: path.join(root, "CLAUDE.md"),
      content: await readAgentPackFile("templates/CLAUDE.md"),
    },
    {
      path: path.join(root, ".claude", "rules", "codemap-mcp-first.md"),
      content: await readAgentPackFile("rules/mcp-first.md"),
    },
    {
      path: path.join(root, ".claude", "rules", "codemap-task-lifecycle.md"),
      content: await readAgentPackFile("rules/task-lifecycle.md"),
    },
    ...(await listSkillWrites(root, "claude")),
  ];
}

async function planCursor(root: string): Promise<PlannedWrite[]> {
  const mcpFirst = await readAgentPackFile("rules/mcp-first.md");
  const lifecycle = await readAgentPackFile("rules/task-lifecycle.md");
  return [
    {
      path: path.join(root, ".cursor", "rules", "codemap.mdc"),
      content: [
        "---",
        "description: CodeMap MCP-first workflow",
        "alwaysApply: true",
        "---",
        "",
        mcpFirst,
        "",
        lifecycle,
      ].join("\n"),
    },
  ];
}

async function planGemini(root: string): Promise<PlannedWrite[]> {
  return [
    {
      path: path.join(root, "GEMINI.md"),
      content: await readAgentPackFile("templates/GEMINI.md"),
    },
  ];
}

async function planOpenCode(root: string): Promise<PlannedWrite[]> {
  return [
    {
      path: path.join(root, ".opencode", "AGENTS.md"),
      content: await readAgentPackFile("templates/opencode-AGENTS.md"),
    },
    {
      path: path.join(root, ".opencode", "INSTALL.md"),
      content: await readAgentPackFile("templates/opencode-INSTALL.md"),
    },
  ];
}

async function planCopilot(root: string): Promise<PlannedWrite[]> {
  return [
    {
      path: path.join(root, "COPILOT.md"),
      content: await readAgentPackFile("templates/COPILOT.md"),
    },
  ];
}

function defaultMarketplace(pluginPath?: string) {
  return {
    name: "codemap-agent-pack-marketplace",
    interface: {
      displayName: "CodeMap Agent Pack",
    },
    plugins: [
      {
        name: "codemap-agent-pack",
        source: {
          source: "local",
          path: pluginPath ?? "./packages/mcp-server",
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
        category: "Coding",
      },
    ],
  };
}

async function planMarketplace(root: string, pluginPath?: string): Promise<PlannedWrite[]> {
  const marketplacePath = path.join(root, ".agents", "plugins", "marketplace.json");
  let marketplace = defaultMarketplace(pluginPath);

  try {
    const raw = await readFile(marketplacePath, "utf8");
    const parsed = JSON.parse(raw) as {
      name?: string;
      interface?: { displayName?: string };
      plugins?: Array<Record<string, unknown>>;
    };
    const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];
    const nextEntry = defaultMarketplace(pluginPath).plugins[0];
    const existingIndex = plugins.findIndex((plugin) => plugin.name === "codemap-agent-pack");
    if (existingIndex >= 0) {
      plugins[existingIndex] = nextEntry;
    } else {
      plugins.push(nextEntry);
    }
    marketplace = {
      name: parsed.name ?? marketplace.name,
      interface: {
        displayName: parsed.interface?.displayName ?? marketplace.interface.displayName,
      },
      plugins: plugins as typeof marketplace.plugins,
    };
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  return [
    {
      path: marketplacePath,
      content: JSON.stringify(marketplace, null, 2),
    },
  ];
}

async function planWrites(
  root: string,
  target: Exclude<InstallTarget, "all">,
  pluginPath?: string,
) {
  if (target === "codex") return planCodex(root);
  if (target === "claude") return planClaude(root);
  if (target === "cursor") return planCursor(root);
  if (target === "gemini") return planGemini(root);
  if (target === "opencode") return planOpenCode(root);
  if (target === "copilot") return planCopilot(root);
  return planMarketplace(root, pluginPath);
}

async function applyWrite(write: PlannedWrite, options: Required<Pick<AgentPackInstallOptions, "dryRun" | "force">>) {
  const alreadyExists = await exists(write.path);
  const action = alreadyExists
    ? options.force
      ? "overwrite"
      : "backup"
    : "create";

  if (options.dryRun) {
    return { path: write.path, action: `would ${action}` };
  }

  await mkdir(path.dirname(write.path), { recursive: true });

  if (alreadyExists && !options.force) {
    const backupPath = `${write.path}.codemap-backup-${Date.now()}`;
    await rename(write.path, backupPath);
  }

  if (write.sourcePath) {
    await copyFile(write.sourcePath, write.path);
  } else {
    await writeFile(write.path, `${write.content ?? ""}\n`, "utf8");
  }

  return { path: write.path, action };
}

export async function installAgentPack(options: AgentPackInstallOptions) {
  const root = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const pluginPath = options.pluginPath;
  const installed: Array<{ path: string; action: string }> = [];

  for (const target of targetsFor(options.target)) {
    const writes =
      target === "marketplace"
        ? await planMarketplace(root, pluginPath)
        : await planWrites(root, target, pluginPath);
    for (const write of writes) {
      installed.push(await applyWrite(write, { dryRun, force }));
    }
  }

  return {
    target: options.target,
    dryRun,
    force,
    root,
    installed,
    packRoot: getAgentPackRoot(),
    pluginRoot: getPluginRoot(),
  };
}

export async function listAgentPackFiles() {
  const root = getAgentPackRoot();
  const entries = await readdir(root, { recursive: true });
  return entries.map((entry) => path.join(root, entry.toString()));
}
