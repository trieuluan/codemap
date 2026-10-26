import type { Command } from "./types.js";
import {
  is9RouterRunning,
  ensure9RouterRunning,
  NINE_ROUTER_LOCAL_PORT,
} from "../../agent/setup/9router-helpers.js";

export const ninerouterCommand: Command = {
  name: "9router",
  description: "Manage 9router: status, restart",
  execute: async (args, ctx) => {
    const sub = args.trim().split(/\s+/)[0];

    // Default or "status"
    if (!sub || sub === "status") {
      const running = await is9RouterRunning();
      ctx.appendMessage({
        role: "system",
        content: running
          ? `9router running on port ${NINE_ROUTER_LOCAL_PORT}`
          : "9router not running",
      });
      return;
    }

    if (sub === "restart") {
      ctx.setBusy(true);
      // Kill existing 9router processes (all of them, since we can't track
      // which specific PID the managed child refers to from here)
      try {
        const { execSync } = await import("node:child_process");
        execSync("pkill -f '9router --port'", { stdio: "ignore" });
      } catch {
        // pkill returns exit code 1 if no process found — ignore
      }
      // Wait briefly for process to terminate
      await new Promise((r) => setTimeout(r, 500));

      const child = await ensure9RouterRunning();
      ctx.setBusy(false);

      ctx.appendMessage({
        role: "system",
        content: child
          ? "9router restarted"
          : "9router could not be started (not installed or already running)",
      });
      return;
    }

    // Unknown subcommand
    ctx.appendMessage({
      role: "system",
      content: "Usage:\n/9router — check status\n/9router status — same\n/9router restart — kill and respawn",
    });
  },
};
