import type { Command } from "./types.js";
import { getCommandList } from "./index.js";

export const helpCommand: Command = {
  name: "help",
  description: "Show this help",
  execute: (_args, ctx) => {
    const lines = getCommandList().map(
      (c) => `/${c.name.padEnd(18)} ${c.description}`,
    );
    lines.push("", "@mention           Type @ to autocomplete file paths");
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: lines.join("\n") },
    ]);
  },
};
