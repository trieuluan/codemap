import type { Command } from "./index.js";
import {
  readWorkspacePath,
  saveMcpServerEntry,
  removeMcpServerEntry,
} from "../../../lib/workspace-project.js";
import type { McpServerStatus } from "../mcp-tool-client.js";

export const mcpCommand: Command = {
  name: "mcp",
  description: "Manage MCP servers: list, add, remove",
  execute: async (args, ctx) => {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];

    if (!sub) {
      return showStatus(ctx);
    }

    if (sub === "add") {
      const name = parts[1];
      const command = parts[2];
      if (!name || !command) {
        ctx.setMessages((prev) => [
          ...prev,
          { role: "system", content: "Usage: /mcp add <name> <command> [args...]" },
        ]);
        return;
      }
      const cmdArgs = parts.slice(3);
      const workspaceRoot = await readWorkspacePath();
      await saveMcpServerEntry(workspaceRoot, name, {
        command,
        args: cmdArgs.length > 0 ? cmdArgs : undefined,
      });
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Added MCP server "${name}" → ${command} ${cmdArgs.join(" ")}\nRestart chat to connect.`,
        },
      ]);
      return;
    }

    if (sub === "remove") {
      const name = parts[1];
      if (!name) {
        ctx.setMessages((prev) => [
          ...prev,
          { role: "system", content: "Usage: /mcp remove <name>" },
        ]);
        return;
      }
      if (name === "codemap") {
        ctx.setMessages((prev) => [
          ...prev,
          { role: "system", content: "Cannot remove the default codemap server." },
        ]);
        return;
      }
      const workspaceRoot = await readWorkspacePath();
      const removed = await removeMcpServerEntry(workspaceRoot, name);
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: removed
            ? `Removed MCP server "${name}". Restart chat to disconnect.`
            : `MCP server "${name}" not found in config.`,
        },
      ]);
      return;
    }

    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: "Unknown subcommand. Usage:\n/mcp — list servers\n/mcp add <name> <command> [args...]\n/mcp remove <name>",
      },
    ]);
  },
};

function showStatus(ctx: Parameters<Command["execute"]>[1]) {
  const statuses: McpServerStatus[] = ctx.toolClient.getServerStatuses();
  const lines = ["MCP Servers:", ""];

  for (const s of statuses) {
    const icon = s.connected ? "●" : "✗";
    const color = s.connected ? "connected" : `error: ${s.error ?? "unknown"}`;
    const toolCount = s.tools > 0 ? ` (${s.tools} tools)` : "";
    lines.push(`  ${icon} ${s.name} — ${color}${toolCount}`);
  }

  if (statuses.length <= 1) {
    lines.push("");
    lines.push("Add external servers: /mcp add <name> <command> [args...]");
    lines.push("Or configure in .codemap/mcp.json → mcpServers");
  }

  ctx.setMessages((prev) => [
    ...prev,
    { role: "system", content: lines.join("\n") },
  ]);
}
