import type { Command } from "./types.js";

export const clearCommand: Command = {
  name: "clear",
  description: "Clear screen and start a new session (old session preserved in /sessions)",
  execute: (_args, ctx) => {
    ctx.newSession?.();
  },
};
