import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";

export const AGENT_PACK_INDEX_URI = "codemap://agent-pack/index";
export const AGENT_PACK_INSTALL_URI = "codemap://agent-pack/install";
export const AGENT_PACK_CODEX_URI = "codemap://agent-pack/codex";
export const AGENT_PACK_CLAUDE_URI = "codemap://agent-pack/claude";
export const AGENT_PACK_CURSOR_URI = "codemap://agent-pack/cursor";
export const AGENT_PACK_GEMINI_URI = "codemap://agent-pack/gemini";
export const AGENT_PACK_OPENCODE_URI = "codemap://agent-pack/opencode";
export const AGENT_PACK_COPILOT_URI = "codemap://agent-pack/copilot";

export const AGENT_PACK_SKILLS = [
  "mcp-first-exploration",
  "feature-area-investigation",
  "symbol-level-debugging",
  "interpreting-codemap-output",
  "safe-edit-and-reimport",
  "token-efficient-code-review",
  "brainstorming",
  "test-driven-development",
] as const;

export type AgentPackSkillName = (typeof AGENT_PACK_SKILLS)[number];

export function skillResourceUri(skillName: AgentPackSkillName) {
  return `codemap://skills/${skillName}`;
}

export function getAgentPackRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "../../agent-pack");
}

export function getPluginRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "../..");
}

export async function readAgentPackFile(relativePath: string) {
  return readFile(path.join(getAgentPackRoot(), relativePath), "utf8");
}

export async function readAgentPackSkill(skillName: AgentPackSkillName) {
  return readAgentPackFile(`skills/${skillName}/SKILL.md`);
}

export function buildAgentPackIndexMarkdown() {
  return [
    "# CodeMap Agent Pack",
    "",
    "CodeMap Agent Pack is the workflow layer for CodeMap MCP. It teaches agents to use CodeMap as a context engine before raw file reads.",
    "",
    "## Resources",
    `- ${AGENT_PACK_INSTALL_URI}`,
    `- ${AGENT_PACK_CODEX_URI}`,
    `- ${AGENT_PACK_CLAUDE_URI}`,
    `- ${AGENT_PACK_CURSOR_URI}`,
    `- ${AGENT_PACK_GEMINI_URI}`,
    `- ${AGENT_PACK_OPENCODE_URI}`,
    `- ${AGENT_PACK_COPILOT_URI}`,
    "",
    "## Skills",
    ...AGENT_PACK_SKILLS.map((skill) => `- ${skillResourceUri(skill)}`),
    "",
    "## Local Install",
    "",
    "```bash",
    "codemap-mcp init-agent-pack --target all",
    "```",
    "",
    "Use `codemap-mcp agent-pack-path` to print the local plugin root path.",
  ].join("\n");
}

export function buildHarnessMarkdown(
  harness: "codex" | "claude" | "cursor" | "gemini" | "opencode" | "copilot",
) {
  const title =
    harness === "codex"
      ? "Codex"
      : harness === "claude"
        ? "Claude"
        : harness === "cursor"
          ? "Cursor"
          : harness === "gemini"
            ? "Gemini"
            : harness === "opencode"
              ? "OpenCode"
              : "GitHub Copilot CLI";

  return [
    `# CodeMap Agent Pack for ${title}`,
    "",
    "Install local rules and skills with:",
    "",
    "```bash",
    `codemap-mcp init-agent-pack --target ${harness}`,
    "```",
    "",
    "The installed guidance tells the agent to use CodeMap MCP tools for exploration, symbol context, review, verification, and reimport.",
  ].join("\n");
}
