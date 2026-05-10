import type { Command } from "./index.js";

export const debugCommand: Command = {
  name: "debug",
  description: "Toggle stream debug logging to JSONL file",
  execute: (args, ctx) => {
    const set = (on: boolean) => {
      ctx.setDebug(on);
      const logLine = ctx.debugLogFile ? `\nLog file: ${ctx.debugLogFile}` : "\nLog file will be created on next message.";
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Debug mode: ${on ? "ON" : "OFF"}${on ? logLine : ""}`,
        },
      ]);
    };

    if (args === "on") return set(true);
    if (args === "off") return set(false);
    // Toggle
    set(!ctx.debug);
  },
};
