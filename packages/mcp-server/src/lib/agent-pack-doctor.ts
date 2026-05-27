import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { AGENT_PACK_SKILLS } from "./agent-pack.js";

export const AGENT_PACK_DOCTOR_TARGETS = [
  "auto",
  "codex",
  "claude",
  "cursor",
  "gemini",
  "opencode",
  "copilot",
  "all",
] as const;

export type AgentPackDoctorTarget = (typeof AGENT_PACK_DOCTOR_TARGETS)[number];
export type AgentPackDoctorStatus = "pass" | "warn" | "fail";

export interface AgentPackDoctorCheck extends Record<string, unknown> {
  target: Exclude<AgentPackDoctorTarget, "auto" | "all">;
  name: string;
  path: string;
  status: AgentPackDoctorStatus;
  required: boolean;
  message: string;
  missingPhrases?: string[];
}

export interface AgentPackDoctorResult extends Record<string, unknown> {
  status: AgentPackDoctorStatus;
  root: string;
  requestedTarget: AgentPackDoctorTarget;
  targets: Array<Exclude<AgentPackDoctorTarget, "auto" | "all">>;
  checks: AgentPackDoctorCheck[];
  missingFiles: string[];
  missingPhrases: Array<{ path: string; phrases: string[] }>;
  suggestions: string[];
}

type ConcreteTarget = Exclude<AgentPackDoctorTarget, "auto" | "all">;

interface FileExpectation {
  target: ConcreteTarget;
  name: string;
  relativePath: string;
  required: boolean;
  phrases?: string[];
}

const CONCRETE_TARGETS: ConcreteTarget[] = [
  "codex",
  "claude",
  "cursor",
  "gemini",
  "opencode",
  "copilot",
];

const COMMON_WORKFLOW_PHRASES = [
  "get_agent_workflow",
  "get_project",
  "explore_task",
];

function isConcreteTarget(target: string | undefined): target is ConcreteTarget {
  return CONCRETE_TARGETS.includes(target as ConcreteTarget);
}

export function parseAgentPackDoctorArgs(args: string[]) {
  let target: AgentPackDoctorTarget = "auto";
  let cwd: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target") {
      target = parseDoctorTarget(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--root" || arg === "--cwd") {
      cwd = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--target=")) {
      target = parseDoctorTarget(arg.slice("--target=".length));
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

  return { target, cwd };
}

export function parseDoctorTarget(value: string | undefined): AgentPackDoctorTarget {
  if (value && AGENT_PACK_DOCTOR_TARGETS.includes(value as AgentPackDoctorTarget)) {
    return value as AgentPackDoctorTarget;
  }
  return "auto";
}

async function fileExists(filePath: string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function skillExpectations(target: "codex" | "claude"): FileExpectation[] {
  return AGENT_PACK_SKILLS.map((skill) => ({
    target,
    name: `Skill: codemap-${skill}`,
    relativePath: `.${target}/skills/codemap-${skill}/SKILL.md`,
    required: true,
  }));
}

function expectationsFor(target: ConcreteTarget): FileExpectation[] {
  if (target === "codex") {
    return [
      {
        target,
        name: "Codex root instructions",
        relativePath: "AGENTS.md",
        required: true,
        phrases: COMMON_WORKFLOW_PHRASES,
      },
      {
        target,
        name: "Codex agent pack guide",
        relativePath: ".codex/codemap-agent-pack.md",
        required: true,
        phrases: ["explore_task", "verification"],
      },
      ...skillExpectations(target),
    ];
  }

  if (target === "claude") {
    return [
      {
        target,
        name: "Claude root instructions",
        relativePath: "CLAUDE.md",
        required: true,
        phrases: ["explore_task", "codemap-brainstorming"],
      },
      {
        target,
        name: "Claude MCP-first rule",
        relativePath: ".claude/rules/codemap-mcp-first.md",
        required: true,
        phrases: ["get_agent_workflow", "get_project"],
      },
      {
        target,
        name: "Claude task lifecycle rule",
        relativePath: ".claude/rules/codemap-task-lifecycle.md",
        required: true,
        phrases: ["refresh_local_index", "reimport"],
      },
      {
        target,
        name: "Claude hooks",
        relativePath: ".claude/settings.json",
        required: false,
        phrases: ["codemap-mcp session-hint", "codemap-mcp pre-edit", "codemap-mcp local-index"],
      },
      ...skillExpectations(target),
    ];
  }

  if (target === "cursor") {
    return [
      {
        target,
        name: "Cursor always-on rule",
        relativePath: ".cursor/rules/codemap.mdc",
        required: true,
        phrases: ["alwaysApply: true", ...COMMON_WORKFLOW_PHRASES],
      },
    ];
  }

  if (target === "gemini") {
    return [
      {
        target,
        name: "Gemini root instructions",
        relativePath: "GEMINI.md",
        required: true,
        phrases: COMMON_WORKFLOW_PHRASES,
      },
    ];
  }

  if (target === "opencode") {
    return [
      {
        target,
        name: "OpenCode root instructions",
        relativePath: ".opencode/AGENTS.md",
        required: true,
        phrases: COMMON_WORKFLOW_PHRASES,
      },
      {
        target,
        name: "OpenCode install notes",
        relativePath: ".opencode/INSTALL.md",
        required: false,
        phrases: ["CodeMap"],
      },
    ];
  }

  return [
    {
      target,
      name: "Copilot root instructions",
      relativePath: "COPILOT.md",
      required: true,
      phrases: COMMON_WORKFLOW_PHRASES,
    },
  ];
}

const DETECTION_FILES: Record<ConcreteTarget, string[]> = {
  codex: ["AGENTS.md", ".codex/codemap-agent-pack.md"],
  claude: ["CLAUDE.md", ".claude/rules/codemap-mcp-first.md"],
  cursor: [".cursor/rules/codemap.mdc"],
  gemini: ["GEMINI.md"],
  opencode: [".opencode/AGENTS.md"],
  copilot: ["COPILOT.md"],
};

async function detectTargets(root: string): Promise<ConcreteTarget[]> {
  const detected: ConcreteTarget[] = [];
  for (const target of CONCRETE_TARGETS) {
    const hasMarker = await Promise.all(
      DETECTION_FILES[target].map((file) => fileExists(path.join(root, file))),
    );
    if (hasMarker.some(Boolean)) detected.push(target);
  }
  return detected;
}

async function targetsFor(root: string, requestedTarget: AgentPackDoctorTarget) {
  if (requestedTarget === "all") return CONCRETE_TARGETS;
  if (isConcreteTarget(requestedTarget)) return [requestedTarget];

  const detected = await detectTargets(root);
  return detected.length > 0 ? detected : CONCRETE_TARGETS;
}

async function checkExpectation(root: string, expectation: FileExpectation): Promise<AgentPackDoctorCheck> {
  const fullPath = path.join(root, expectation.relativePath);
  const content = await readIfExists(fullPath);

  if (content === null) {
    return {
      target: expectation.target,
      name: expectation.name,
      path: expectation.relativePath,
      status: expectation.required ? "fail" : "warn",
      required: expectation.required,
      message: expectation.required ? "Missing required file." : "Optional file is not installed.",
    };
  }

  const missingPhrases =
    expectation.phrases?.filter((phrase) => !content.includes(phrase)) ?? [];

  if (missingPhrases.length > 0) {
    return {
      target: expectation.target,
      name: expectation.name,
      path: expectation.relativePath,
      status: expectation.required ? "fail" : "warn",
      required: expectation.required,
      message: "File exists but is missing required workflow text.",
      missingPhrases,
    };
  }

  return {
    target: expectation.target,
    name: expectation.name,
    path: expectation.relativePath,
    status: "pass",
    required: expectation.required,
    message: "Installed.",
  };
}

function overallStatus(checks: AgentPackDoctorCheck[]): AgentPackDoctorStatus {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

interface AgentPackDoctorSuggestionContext {
  status: AgentPackDoctorStatus;
  root: string;
  targets: ConcreteTarget[];
  missingPhrases: Array<{ path: string; phrases: string[] }>;
}

function buildSuggestions(result: AgentPackDoctorSuggestionContext): string[] {
  const suggestions: string[] = [];
  if (result.status === "pass") {
    suggestions.push("Agent Pack doctor passed. Agents should still start sessions with get_agent_workflow.");
    return suggestions;
  }

  const targets = result.targets.length === CONCRETE_TARGETS.length ? "all" : result.targets.join(",");
  suggestions.push(`Run codemap-mcp init-agent-pack --target ${targets} --root ${result.root}`);
  suggestions.push(`Run codemap-mcp doctor-agent-pack --target ${targets} --root ${result.root} after install.`);
  if (result.missingPhrases.length > 0) {
    suggestions.push("Use --force when you want CodeMap to overwrite stale Agent Pack instructions.");
  }
  return suggestions;
}

export async function doctorAgentPack(input: {
  root?: string;
  target?: AgentPackDoctorTarget;
} = {}): Promise<AgentPackDoctorResult> {
  const root = path.resolve(input.root ?? process.cwd());
  const requestedTarget = input.target ?? "auto";
  const targets = await targetsFor(root, requestedTarget);
  const checks = (
    await Promise.all(
      targets.flatMap((target) =>
        expectationsFor(target).map((expectation) => checkExpectation(root, expectation)),
      ),
    )
  ).flat();

  const missingFiles = checks
    .filter((check) => check.status !== "pass" && !check.missingPhrases?.length)
    .map((check) => check.path);
  const missingPhrases = checks
    .filter((check) => check.missingPhrases?.length)
    .map((check) => ({ path: check.path, phrases: check.missingPhrases ?? [] }));

  const base = {
    status: overallStatus(checks),
    root,
    requestedTarget,
    targets,
    checks,
    missingFiles,
    missingPhrases,
  };

  return {
    ...base,
    suggestions: buildSuggestions(base),
  };
}

export function buildAgentPackDoctorMarkdown(result: AgentPackDoctorResult) {
  const lines = [
    `# CodeMap Agent Pack Doctor: ${result.status.toUpperCase()}`,
    "",
    `Root: ${result.root}`,
    `Requested target: ${result.requestedTarget}`,
    `Checked targets: ${result.targets.join(", ")}`,
    "",
    "## Checks",
  ];

  for (const check of result.checks) {
    const marker = check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL";
    lines.push(`- ${marker} ${check.target}: ${check.name} (${check.path})`);
    if (check.status !== "pass") {
      lines.push(`  ${check.message}`);
      if (check.missingPhrases?.length) {
        lines.push(`  Missing phrases: ${check.missingPhrases.join(", ")}`);
      }
    }
  }

  if (result.suggestions.length > 0) {
    lines.push("", "## Suggestions", ...result.suggestions.map((suggestion) => `- ${suggestion}`));
  }

  return lines.join("\n");
}
