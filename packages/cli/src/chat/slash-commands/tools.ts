import type { Command } from "./types.js";
import { TOOL_CATEGORIES, type ToolCategory } from "./tool-categories.js";
import {
  getMastraMcpStatusSummary,
  MASTRA_DISABLED_TOOLS,
} from "@codemap-ai/runtime-node";
import { getLoadedCustomTools } from "../../agent/runtime/introspection/tools.js";
import { readWorkspacePath } from "@codemap-ai/core/lib/workspace-project.js";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { toolsCommand as sharedTools } from "@codemap-ai/shared";
import { executeSharedCommand } from "./shared-bridge.js";

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const C_GRAY = "\x1b[38;2;107;114;128m";
const C_CYAN = `${BOLD}\x1b[38;2;0;229;255m`;
const C_GREEN = "\x1b[38;2;34;197;94m";
const C_YELLOW = "\x1b[38;2;250;204;21m";
const C_MAGENTA = "\x1b[38;2;217;119;214m";
const C_RED = "\x1b[38;2;239;68;68m";

const SECTION: Record<ToolCategory, { label: string; color: string; note: string }> = {
  local: { label: "LOCAL", color: C_GREEN,  note: "works offline, no auth" },
  auth:  { label: "AUTH",  color: C_YELLOW, note: "login required" },
  cloud: { label: "CLOUD", color: C_CYAN,   note: "login + linked project" },
};

const EXTERNAL_SECTION = { label: "EXTERNAL", color: C_MAGENTA, note: "from user MCP servers" };

const C_ORANGE = "\x1b[38;2;251;146;60m";
const CUSTOM_SECTION = { label: "CUSTOM", color: C_ORANGE, note: "from .codemap/tools/" };

const TOOLS_DIR = ".codemap/tools";

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export const toolsCommand: Command = {
  name: "tools",
  description: "List, init, add, or reload custom tools",
  execute: async (args, ctx) => {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];

    if (sub === "init") {
      return initTools(ctx);
    }

    if (sub === "add") {
      return addTool(parts.slice(1), ctx);
    }

    if (sub === "reload") {
      return reloadTools(ctx);
    }

    // Default: delegate to shared for markdown-formatted tool list
    return executeSharedCommand(sharedTools, args, ctx);
  },
};

async function initTools(ctx: Parameters<Command["execute"]>[1]) {
  ctx.setBusy(true);
  try {
    const workspaceRoot = await readWorkspacePath();
    const toolsDir = join(workspaceRoot, TOOLS_DIR);

    if (await pathExists(toolsDir)) {
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: `${C_YELLOW}Tools directory already exists:${RESET} ${toolsDir}` },
      ]);
      ctx.setBusy(false);
      return;
    }

    await mkdir(toolsDir, { recursive: true });

    const exampleContent = `export default {
  name: "hello",
  description: "Say hello to someone",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name to greet" },
    },
    required: ["name"],
  },
  async execute(input: { name: string }) {
    return \`Hello, \${input.name}!\`;
  },
};
`;

    await writeFile(join(toolsDir, "hello.tool.ts"), exampleContent, "utf8");

    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `${C_GREEN}Tools directory created!${RESET}`,
          "",
          `Location: ${toolsDir}`,
          "",
          `${BOLD}Example tool:${RESET} hello.tool.ts`,
          `${C_GRAY}  Try: /tools add my-tool --desc "My tool description"${RESET}`,
          "",
          `${BOLD}Tool format:${RESET}`,
          `  Each tool is a ${C_CYAN}.tool.ts${RESET} file exporting { name, description, execute }`,
          `  Optional: export a ${C_CYAN}parameters${RESET} object (JSON Schema) for typed inputs`,
          `  The ${C_CYAN}execute${RESET} function receives (input, ctx) and returns a string`,
          "",
          `${C_GRAY}Run /tools reload to load the new tool.${RESET}`,
        ].join("\n"),
      },
    ]);
  } catch (err) {
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: `${C_RED}Failed to init tools:${RESET} ${err}` },
    ]);
  }
  ctx.setBusy(false);
}

async function addTool(args: string[], ctx: Parameters<Command["execute"]>[1]) {
  if (args.length === 0) {
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `${BOLD}Usage:${RESET}`,
          "/tools add <name> [options]",
          "",
          `${BOLD}Options:${RESET}`,
          "  --desc \"description\"   Tool description",
          "",
          `${BOLD}Example:${RESET}`,
          '  /tools add deploy --desc "Deploy app to staging"',
          "",
          `${C_GRAY}Creates a .tool.ts file in .codemap/tools/ with a starter template.${RESET}`,
        ].join("\n"),
      },
    ]);
    return;
  }

  const name = args[0];
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: `${C_RED}Invalid name:${RESET} "${name}". Use lowercase letters, numbers, and hyphens.` },
    ]);
    return;
  }

  // Parse flags
  const flags: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i]?.startsWith("--") && i + 1 < args.length) {
      const key = args[i]!.slice(2);
      flags[key] = args[++i]!;
    }
  }

  const description = flags.desc ?? `Custom tool: ${name}`;

  try {
    const workspaceRoot = await readWorkspacePath();
    const toolsDir = join(workspaceRoot, TOOLS_DIR);

    if (!(await pathExists(toolsDir))) {
      await mkdir(toolsDir, { recursive: true });
    }

    const filePath = join(toolsDir, `${name}.tool.ts`);

    if (await pathExists(filePath)) {
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: `${C_YELLOW}Tool already exists:${RESET} ${filePath}` },
      ]);
      return;
    }

    const content = `export default {
  name: "${name}",
  description: "${description}",
  parameters: {
    type: "object",
    properties: {
      input: { type: "string", description: "Tool input" },
    },
  },
  async execute(input: Record<string, unknown>) {
    // TODO: implement tool logic
    return \`Tool ${name} executed with: \${JSON.stringify(input)}\`;
  },
};
`;

    await writeFile(filePath, content, "utf8");

    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `${C_GREEN}Tool added!${RESET}`,
          "",
          `Name: ${C_CYAN}${name}${RESET}`,
          `File: ${filePath}`,
          "",
          `${C_GRAY}Run /tools reload to load the new tool.${RESET}`,
        ].join("\n"),
      },
    ]);
  } catch (err) {
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: `${C_RED}Failed to add tool:${RESET} ${err}` },
    ]);
  }
}


async function reloadTools(ctx: Parameters<Command["execute"]>[1]) {
  if (!ctx.reinitHarness) {
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: `${C_RED}Reload not available${RESET} — harness reinit is not supported in this context.` },
    ]);
    return;
  }

  ctx.setBusy(true);
  try {
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: `${C_GRAY}Reloading tools…${RESET}` },
    ]);

    await ctx.reinitHarness();

    const customTools = getLoadedCustomTools();
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `${C_GREEN}Tools reloaded!${RESET}`,
          "",
          customTools.length > 0
            ? `${CUSTOM_SECTION.color}${customTools.length} custom tool(s)${RESET} loaded from .codemap/tools/`
            : `${C_GRAY}No custom tools found in .codemap/tools/${RESET}`,
        ].join("\n"),
      },
    ]);
  } catch (err) {
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: `${C_RED}Reload failed:${RESET} ${err}` },
    ]);
  }
  ctx.setBusy(false);
}
