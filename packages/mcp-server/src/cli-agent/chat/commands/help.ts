import type { Command } from "./types.js";

export const helpCommand: Command = {
  name: "help",
  description: "Show this help",
  execute: (_args, ctx) => {
    const lines = (ctx.getCommandList?.() ?? []).map(
      (c) => `/${c.name.padEnd(18)} ${c.description}`,
    );
    lines.push("", "@mention           Type @ to autocomplete file paths");
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: lines.join("\n") },
    ]);
  },
};
