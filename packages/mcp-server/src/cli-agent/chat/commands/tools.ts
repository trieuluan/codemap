import type { Command } from "./index.js";

export const toolsCommand: Command = {
  name: "tools",
  description: "List available MCP tools",
  execute: async (_args, ctx) => {
    ctx.setBusy(true);
    try {
      const tools = await ctx.toolClient.listAllowedTools();
      const toolNameW = Math.max(6, ...tools.map((t) => t.name.length));

      const lines: string[] = [`Available tools (${tools.length}):`];
      lines.push(
        `  ${"Tool".padEnd(toolNameW)}  Description`,
      );
      lines.push(
        `  ${"─".repeat(toolNameW)}  ${"─".repeat(50)}`,
      );
      for (const t of tools) {
        lines.push(
          `  ${t.name.padEnd(toolNameW)}  ${t.description || ""}`,
        );
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
