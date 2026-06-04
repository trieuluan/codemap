import type { Command } from "./types.js";
import { TOOL_CATEGORIES, type ToolCategory } from "./tool-categories.js";
import { getMastraMcpStatusSummary, MASTRA_DISABLED_TOOLS, getLoadedCustomTools } from "../../agent/runtime/harness-runtime.js";
import { readWorkspacePath } from "@codemap/core/lib/workspace-project.js";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { CustomToolDescriptor, CustomToolKind } from "../../agent/tools/custom/custom-tools-types.js";

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

    // Default: list tools
    return listTools(ctx);
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

    // Create example tool
    const exampleTool: CustomToolDescriptor = {
      name: "hello",
      description: "Say hello to someone",
      kind: "command",
      command: 'echo "Hello, {{name}}!"',
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name to greet" },
        },
        required: ["name"],
      },
    };

    await writeFile(
      join(toolsDir, "hello.tool.json"),
      JSON.stringify(exampleTool, null, 2) + "\n",
      "utf8",
    );

    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `${C_GREEN}Tools directory created!${RESET}`,
          "",
          `Location: ${toolsDir}`,
          "",
          `${BOLD}Example tool:${RESET} hello.tool.json`,
          `${C_GRAY}  Try: /tools add my-tool --kind command --cmd "echo {{input}}"${RESET}`,
          "",
          `${BOLD}Tool types:${RESET}`,
          `  ${C_CYAN}command${RESET} — run shell commands`,
          `  ${C_CYAN}http${RESET}    — call HTTP APIs`,
          `  ${C_CYAN}script${RESET}  — run JS/TS modules`,
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
          "/tools add <name> --kind <command|http|script> [options]",
          "",
          `${BOLD}Options:${RESET}`,
          "  --desc \"description\"   Tool description (required)",
          "  --cmd \"command\"        Shell command for kind=command",
          "  --url \"url\"            URL template for kind=http",
          "  --method GET|POST      HTTP method (default: GET)",
          "  --script \"path\"        Script path for kind=script",
          "",
          `${BOLD}Examples:${RESET}`,
          '  /tools add deploy --kind command --desc "Deploy app" --cmd "npm run deploy --env={{env}}"',
          '  /tools add check-api --kind http --desc "Check API status" --url "https://api.example.com/status"',
          '  /tools add analyze --kind script --desc "Analyze deps" --script "scripts/analyze.ts"',
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

  const kind = flags.kind as CustomToolKind | undefined;
  if (!kind || !["command", "http", "script"].includes(kind)) {
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: `${C_RED}Missing or invalid --kind${RESET}. Use: command, http, or script` },
    ]);
    return;
  }

  const description = flags.desc ?? `Custom ${kind} tool: ${name}`;

  const descriptor: CustomToolDescriptor = {
    name,
    description,
    kind,
  };

  // Kind-specific fields
  if (kind === "command") {
    if (!flags.cmd) {
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: `${C_RED}Missing --cmd${RESET} for kind=command` },
      ]);
      return;
    }
    descriptor.command = flags.cmd;
  } else if (kind === "http") {
    if (!flags.url) {
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: `${C_RED}Missing --url${RESET} for kind=http` },
      ]);
      return;
    }
    descriptor.url = flags.url;
    descriptor.method = flags.method ?? "GET";
  } else if (kind === "script") {
    if (!flags.script) {
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: `${C_RED}Missing --script${RESET} for kind=script` },
      ]);
      return;
    }
    descriptor.script = flags.script;
  }

  // Add timeout if provided
  if (flags.timeout) {
    descriptor.timeoutSeconds = parseInt(flags.timeout, 10);
  }

  try {
    const workspaceRoot = await readWorkspacePath();
    const toolsDir = join(workspaceRoot, TOOLS_DIR);

    // Create directory if it doesn't exist
    if (!(await pathExists(toolsDir))) {
      await mkdir(toolsDir, { recursive: true });
    }

    const filePath = join(toolsDir, `${name}.tool.json`);

    if (await pathExists(filePath)) {
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: `${C_YELLOW}Tool already exists:${RESET} ${filePath}` },
      ]);
      return;
    }

    await writeFile(filePath, JSON.stringify(descriptor, null, 2) + "\n", "utf8");

    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `${C_GREEN}Tool added!${RESET}`,
          "",
          `Name: ${C_CYAN}${name}${RESET}`,
          `Kind: ${kind}`,
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

async function listTools(ctx: Parameters<Command["execute"]>[1]) {
  ctx.setBusy(true);
  try {
    const allTools = await ctx.toolClient.listAllowedTools();
    const disabledSet = new Set(MASTRA_DISABLED_TOOLS.map((n) => n.replace(/^codemap_/, "")));
    const tools = allTools.filter((t) => !disabledSet.has(t.name));
    const disabledTools = allTools.filter((t) => disabledSet.has(t.name));

    const nameW = Math.min(32, Math.max(6, ...allTools.map((t) => t.name.length)));
    const descW = 58;

    const grouped: Record<ToolCategory, typeof tools> = { local: [], auth: [], cloud: [] };
    for (const t of tools) {
      const cat: ToolCategory = TOOL_CATEGORIES[t.name] ?? "cloud";
      grouped[cat].push(t);
    }

    // Get Mastra MCP server statuses to collect external tools
    const mastraStatus = await getMastraMcpStatusSummary();
    const externalTools: { server: string; tools: { name: string; description?: string }[] }[] = [];
    if (mastraStatus?.statuses) {
      for (const server of mastraStatus.statuses) {
        if (server.toolNames.length === 0) continue;
        if (server.name === "codemap") continue; // CodeMap tools already shown in LOCAL/AUTH/CLOUD
        const serverTools = server.toolNames.map((name) => ({ name }));
        externalTools.push({ server: server.name, tools: serverTools });
      }
    }

    const lines: string[] = [
      `${BOLD}Available tools${RESET}  ${C_GRAY}${tools.length} MCP active, ${disabledTools.length} disabled${RESET}`,
      "",
    ];

    for (const cat of ["local", "auth", "cloud"] as ToolCategory[]) {
      const group = grouped[cat];
      if (group.length === 0) continue;
      const { label, color, note } = SECTION[cat];
      lines.push("");
      lines.push(
        `${color}${BOLD}${label}${RESET}  ${C_GRAY}${note}  ·  ${group.length} tools${RESET}`,
      );
      lines.push(`${C_GRAY}${"─".repeat(nameW + descW + 4)}${RESET}`);
      for (const t of group) {
        const name = t.name.padEnd(nameW).slice(0, nameW);
        const raw = (t.description ?? "").replace(/\n.*/s, "").trim();
        const desc = raw.length > descW ? raw.slice(0, descW - 1) + "…" : raw;
        lines.push(`${color}${name}${RESET}  ${C_GRAY}${desc}${RESET}`);
      }
      lines.push("");
    }

    // Show external tools from Mastra MCP servers
    if (externalTools.length > 0) {
      const { label, color, note } = EXTERNAL_SECTION;
      const totalExternal = externalTools.reduce((sum, e) => sum + e.tools.length, 0);
      lines.push("");
      lines.push(
        `${color}${BOLD}${label}${RESET}  ${C_GRAY}${note}  ·  ${totalExternal} tools from ${externalTools.length} server(s)${RESET}`,
      );
      lines.push(`${C_GRAY}${"─".repeat(nameW + descW + 4)}${RESET}`);
      for (const { server, tools: serverTools } of externalTools) {
        lines.push(`${C_GRAY}${" ".repeat(nameW + 2)}${color}[${server}]${RESET}`);
        for (const t of serverTools) {
          const name = t.name.padEnd(nameW).slice(0, nameW);
          lines.push(`${color}${name}${RESET}`);
        }
      }
      lines.push("");
    }

    // Show custom tools from .codemap/tools/
    const customTools = getLoadedCustomTools();
    if (customTools.length > 0) {
      const { label, color, note } = CUSTOM_SECTION;
      lines.push("");
      lines.push(
        `${color}${BOLD}${label}${RESET}  ${C_GRAY}${note}  ·  ${customTools.length} tools${RESET}`,
      );
      lines.push(`${C_GRAY}${"─".repeat(nameW + descW + 4)}${RESET}`);
      for (const t of customTools) {
        const name = t.name.padEnd(nameW).slice(0, nameW);
        const raw = t.description.replace(/\n.*/s, "").trim();
        const desc = raw.length > descW - 4 ? raw.slice(0, descW - 5) + "…" : raw;
        const source = t.source === "project" ? "project" : "global";
        lines.push(`${color}${name}${RESET}  ${C_GRAY}${desc}  [${source}]${RESET}`);
      }
      lines.push("");
    }

    // Show disabled tools (handled by CLI /commands or internal)
    if (disabledTools.length > 0) {
      lines.push("");
      lines.push(
        `${C_GRAY}${BOLD}DISABLED${RESET}  ${C_GRAY}handled by CLI /commands or internal  ·  ${disabledTools.length} tools${RESET}`,
      );
      lines.push(`${C_GRAY}${"─".repeat(nameW + descW + 4)}${RESET}`);
      for (const t of disabledTools) {
        const name = t.name.padEnd(nameW).slice(0, nameW);
        const raw = (t.description ?? "").replace(/\n.*/s, "").trim();
        const desc = raw.length > descW ? raw.slice(0, descW - 1) + "…" : raw;
        lines.push(`${C_GRAY}${name}  ${desc}${RESET}`);
      }
      lines.push("");
    }

    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: lines.join("\n") },
    ]);
  } catch (err) {
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: `Error listing tools: ${err}` },
    ]);
  }
  ctx.setBusy(false);
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
