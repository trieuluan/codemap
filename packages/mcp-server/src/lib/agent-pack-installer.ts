import { constants } from "node:fs";
import { access, copyFile, mkdir, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AGENT_PACK_SKILLS,
  getAgentPackRoot,
  readAgentPackFile,
  readAgentPackSkill,
} from "./agent-pack.js";

type InstallTarget = "codex" | "claude" | "cursor" | "all";

export interface AgentPackInstallOptions {
  target: InstallTarget;
  cwd?: string;
  dryRun?: boolean;
  force?: boolean;
}

interface PlannedWrite {
  path: string;
  content?: string;
  sourcePath?: string;
}

function parseTarget(value: string | undefined): InstallTarget {
  if (value === "codex" || value === "claude" || value === "cursor" || value === "all") {
    return value;
  }
  return "all";
}

export function parseAgentPackInstallArgs(args: string[]) {
  let target: InstallTarget = "all";
  let dryRun = false;
  let force = false;

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
    if (arg.startsWith("--target=")) {
      target = parseTarget(arg.slice("--target=".length));
    }
  }

  return { target, dryRun, force };
}

function targetsFor(target: InstallTarget): Array<Exclude<InstallTarget, "all">> {
  return target === "all" ? ["codex", "claude", "cursor"] : [target];
}

async function exists(filePath: string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function listSkillWrites(root: string): Promise<PlannedWrite[]> {
  return Promise.all(
    AGENT_PACK_SKILLS.map(async (skill) => ({
      path: path.join(root, ".claude", "skills", `codemap-${skill}`, "SKILL.md"),
      content: await readAgentPackSkill(skill),
    })),
  );
}

async function planCodex(root: string): Promise<PlannedWrite[]> {
  return [
    {
      path: path.join(root, "AGENTS.md"),
      content: [
        "# AGENTS.md",
        "",
        "Use CodeMap MCP before raw file reads or grep.",
        "",
        "- Start with `get_agent_workflow` and `get_project`.",
        "- Broad tasks: `explore_task`.",
        "- Feature areas: `summarize_feature_area`.",
        "- Related files: `find_related_files`.",
        "- Known symbols/files: `search_codebase`.",
        "- Several candidates: `get_files`.",
        "- Exact body: `get_symbol_context`.",
        "- After edits: build/test, inspect diff, then reimport when needed.",
      ].join("\n"),
    },
    {
      path: path.join(root, ".codex", "codemap-agent-pack.md"),
      content: await readAgentPackFile("README.md"),
    },
  ];
}

async function planClaude(root: string): Promise<PlannedWrite[]> {
  return [
    {
      path: path.join(root, "CLAUDE.md"),
      content: [
        "# CLAUDE.md",
        "",
        "Use CodeMap MCP-first workflow for this repository.",
        "",
        "Must read:",
        "- `.claude/rules/codemap-mcp-first.md`",
        "- `.claude/rules/codemap-task-lifecycle.md`",
        "",
        "Relevant skills live under `.claude/skills/codemap-*`.",
      ].join("\n"),
    },
    {
      path: path.join(root, ".claude", "rules", "codemap-mcp-first.md"),
      content: await readAgentPackFile("rules/mcp-first.md"),
    },
    {
      path: path.join(root, ".claude", "rules", "codemap-task-lifecycle.md"),
      content: await readAgentPackFile("rules/task-lifecycle.md"),
    },
    ...(await listSkillWrites(root)),
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

async function planWrites(root: string, target: Exclude<InstallTarget, "all">) {
  if (target === "codex") return planCodex(root);
  if (target === "claude") return planClaude(root);
  return planCursor(root);
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
  const installed: Array<{ path: string; action: string }> = [];

  for (const target of targetsFor(options.target)) {
    const writes = await planWrites(root, target);
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
  };
}

export async function listAgentPackFiles() {
  const root = getAgentPackRoot();
  const entries = await readdir(root, { recursive: true });
  return entries.map((entry) => path.join(root, entry.toString()));
}
