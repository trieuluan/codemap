import type { Command } from "./types.js";

export const exitCommand: Command = {
  name: "exit",
  description: "Exit chat",
  execute: (_args, ctx) => {
    ctx.exit();
  },
};
