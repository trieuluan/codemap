import type { Command } from "./types.js";
import { toolBadge } from "./tool-categories.js";

export const toolsCommand: Command = {
  name: "tools",
  description: "List available MCP tools with category badges",
  execute: async (_args, ctx) => {
    ctx.setBusy(true);
    try {
      const tools = await ctx.toolClient.listAllowedTools();
      const nameW = Math.max(6, ...tools.map((t) => t.name.length));

      const lines: string[] = [
        `Available tools (${tools.length})`,
        "",
        "  \x1b[32m[local]\x1b[0m  no auth needed, works offline",
        "  \x1b[33m[auth] \x1b[0m  login required, no cloud project needed",
        "  \x1b[36m[cloud]\x1b[0m  login + linked cloud project required",
        "",
        `  ${"Tool".padEnd(nameW)}  ${"".padEnd(7)}  Description`,
        `  ${"─".repeat(nameW)}  ${"─".repeat(7)}  ${"─".repeat(46)}`,
      ];

      for (const t of tools) {
        const badge = toolBadge(t.name);
        const desc = (t.description ?? "").slice(0, 80);
        lines.push(`  ${t.name.padEnd(nameW)}  ${badge}  ${desc}`);
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
