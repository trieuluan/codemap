import type { Command } from "./types.js";
import { TOOL_CATEGORIES, type ToolCategory } from "./tool-categories.js";
import { getMastraMcpStatusSummary } from "../runtime/mastra-harness-runtime.js";

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const C_GRAY = "\x1b[38;2;107;114;128m";
const C_CYAN = `${BOLD}\x1b[38;2;0;229;255m`;
const C_GREEN = "\x1b[38;2;34;197;94m";
const C_YELLOW = "\x1b[38;2;250;204;21m";
const C_MAGENTA = "\x1b[38;2;217;119;214m";

const SECTION: Record<ToolCategory, { label: string; color: string; note: string }> = {
  local: { label: "LOCAL", color: C_GREEN,  note: "works offline, no auth" },
  auth:  { label: "AUTH",  color: C_YELLOW, note: "login required" },
  cloud: { label: "CLOUD", color: C_CYAN,   note: "login + linked project" },
};

const EXTERNAL_SECTION = { label: "EXTERNAL", color: C_MAGENTA, note: "from Mastra MCP servers" };

export const toolsCommand: Command = {
  name: "tools",
  description: "List available MCP tools grouped by category",
  execute: async (_args, ctx) => {
    ctx.setBusy(true);
    try {
      const tools = await ctx.toolClient.listAllowedTools();
      const nameW = Math.min(32, Math.max(6, ...tools.map((t) => t.name.length)));
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
          if (server.toolNames.length > 0) {
            // Mastra only provides tool names, no descriptions
            const serverTools = server.toolNames.map((name) => ({ name }));
            externalTools.push({ server: server.name, tools: serverTools });
          }
        }
      }

      const lines: string[] = [
        `${BOLD}Available MCP tools${RESET}  ${C_GRAY}${tools.length} total${RESET}`,
        "",
      ];

      for (const cat of ["local", "auth", "cloud"] as ToolCategory[]) {
        const group = grouped[cat];
        if (group.length === 0) continue;
        const { label, color, note } = SECTION[cat];
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
  },
};
