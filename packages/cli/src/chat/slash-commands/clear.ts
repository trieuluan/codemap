import type { Command } from "./types.js";

export const clearCommand: Command = {
  name: "clear",
  description: "Clear screen and start a new session",
  execute: (_args, ctx) => {
    ctx.newSession?.();
  },
};
