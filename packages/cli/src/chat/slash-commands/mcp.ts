import type { Command } from "./types.js";
import {
  readWorkspacePath,
  saveMcpServerEntry,
  removeMcpServerEntry,
} from "@codemap-ai/core/lib/workspace-project.js";
import { getMastraMcpStatusSummary } from "@codemap-ai/runtime-node";
import { mcpCommand as sharedMcp } from "@codemap-ai/shared";
import { executeSharedCommand } from "./shared-bridge.js";

export const mcpCommand: Command = {
  name: "mcp",
  description: "Manage MCP servers: list, add, remove",
  execute: async (args, ctx) => {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];

    // Default (no subcommand): delegate to shared for markdown-rendered list
    if (!sub) {
      return executeSharedCommand(sharedMcp, args, ctx);
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
      const config = { command, args: cmdArgs.length > 0 ? cmdArgs : undefined };
      const workspaceRoot = await readWorkspacePath();
      await saveMcpServerEntry(workspaceRoot, name, config);
      ctx.toolClient.addExtraServer(name, config);
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Added MCP server "${name}" → ${command} ${cmdArgs.join(" ")}\nConnecting…`,
        },
      ]);
      ctx.setBusy(true);
      try {
        await ctx.reinitHarness?.();
      } catch (err) {
        ctx.setBusy(false);
        const msg = err instanceof Error ? err.message : String(err);
        ctx.toolClient.removeExtraServer(name);
        await removeMcpServerEntry(workspaceRoot, name).catch(() => {});
        ctx.setMessages((prev) => [
          ...prev,
          { role: "system", content: `Failed to initialize harness: ${msg.split("\n")[0]}` },
        ]);
        return;
      }

      // Wait for MCP connections to settle
      const summary = await getMastraMcpStatusSummary();
      ctx.setBusy(false);

      const serverStatus = summary?.statuses.find((s) => s.name === name);
      const skipped = summary?.skipped.find((s) => s.name === name);
      if (!serverStatus?.connected || skipped) {
        const errMsg = serverStatus?.error ?? skipped?.reason ?? "unknown error";
        const isNotFound = errMsg.includes("ENOENT") || errMsg.includes("not found");
        const hint = isNotFound
          ? `\n\nTip: "${command}" was not found on PATH. Try using npx:\n  /mcp add ${name} npx ${[command, ...cmdArgs].join(" ")}`
          : "";
        ctx.toolClient.removeExtraServer(name);
        await removeMcpServerEntry(workspaceRoot, name).catch(() => {});
        ctx.setMessages((prev) => [
          ...prev,
          { role: "system", content: `Failed to connect MCP server "${name}": ${errMsg.split("\n")[0]}${hint}` },
        ]);
        ctx.reinitHarness?.().catch(() => {});
      } else {
        ctx.setMessages((prev) => [
          ...prev,
          { role: "system", content: `MCP server "${name}" connected (${serverStatus.toolCount} tools).` },
        ]);
      }
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
      if (!removed) {
        ctx.setMessages((prev) => [
          ...prev,
          { role: "system", content: `MCP server "${name}" not found in config.` },
        ]);
        return;
      }
      ctx.toolClient.removeExtraServer(name);
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: `Removed MCP server "${name}". Reconnecting…` },
      ]);
      ctx.setBusy(true);
      await ctx.reinitHarness?.();
      ctx.setBusy(false);
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: `Harness reinitialized without "${name}".` },
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
