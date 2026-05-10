import React from "react";
import { Box, Text } from "ink";
import type { Command } from "./index.js";

export const toolsCommand: Command = {
  name: "tools",
  description: "List available MCP tools",
  execute: async (_args, ctx) => {
    ctx.setBusy(true);
    try {
      const tools = await ctx.toolClient.listAllowedTools();
      const toolNameW = Math.max(6, ...tools.map((t) => t.name.length));
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Available tools (${tools.length}):`,
          systemComponent: React.createElement(Box, { flexDirection: "column" },
            React.createElement(Text, { color: "cyan", bold: true },
              `  ${"Tool".padEnd(toolNameW)}  Description`
            ),
            React.createElement(Text, { color: "gray" },
              `  ${"─".repeat(toolNameW)}  ${"─".repeat(50)}`
            ),
            ...tools.map((t) =>
              React.createElement(Text, { key: t.name },
                "  ",
                React.createElement(Text, { color: "white", bold: true }, t.name.padEnd(toolNameW)),
                "  ",
                React.createElement(Text, { color: "gray" }, t.description || ""),
              )
            ),
          ),
        },
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
