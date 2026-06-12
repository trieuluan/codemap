import type { Command } from "./types.js";
import {
  getAgentSettings,
  loadSettings,
  writeSettings,
} from "@codemap-ai/runtime-node/settings";

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const C_CYAN = `${BOLD}\x1b[38;2;0;229;255m`;
const C_GREEN = "\x1b[38;2;34;197;94m";
const C_RED = "\x1b[38;2;239;68;68m";
const C_GRAY = "\x1b[38;2;107;114;128m";

export const memoryCommand: Command = {
  name: "memory",
  description: "Toggle working memory on or off",
  execute: async (args, ctx) => {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];

    if (!sub || sub === "status") {
      return showMemoryStatus(ctx);
    }

    if (sub === "on") {
      const scope = parts[1] === "--global" ? "global" : "project";
      return setMemory(true, scope, ctx);
    }

    if (sub === "off") {
      const scope = parts[1] === "--global" ? "global" : "project";
      return setMemory(false, scope, ctx);
    }

    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `${BOLD}Usage:${RESET}`,
          "  /memory              Show working memory status",
          "  /memory status       Same as above",
          "  /memory on           Enable working memory (project scope)",
          "  /memory on --global  Enable working memory (global scope)",
          "  /memory off          Disable working memory (project scope)",
          "  /memory off --global Disable working memory (global scope)",
        ].join("\n"),
      },
    ]);
  },
};

// ─── /memory status ─────────────────────────────────────────────

async function showMemoryStatus(ctx: Parameters<Command["execute"]>[1]) {
  const merged = await loadSettings();
  const agentSettings = getAgentSettings(merged);
  const enabled = agentSettings.workingMemory ?? true;

  const status = enabled ? `${C_GREEN}ON${RESET}` : `${C_RED}OFF${RESET}`;
  const source = agentSettings.workingMemory !== undefined
    ? "project"
    : "default";

  const lines = [
    `${BOLD}Working Memory${RESET}`,
    `  ${status}`,
    "",
    `${C_GRAY}Source: ${source}${RESET}`,
    "  Working memory is stored per-project in `.codemap/settings.json`.",
    "  You can toggle it with `/memory on` or `/memory off`.",
  ];

  ctx.setMessages((prev) => [...prev, { role: "system", content: lines.join("\n") }]);
}

// ─── /memory on / /memory off ───────────────────────────────────

async function setMemory(
  enabled: boolean,
  scope: "global" | "project",
  ctx: Parameters<Command["execute"]>[1],
) {
  const filePath = await writeSettings(scope, { agent: { workingMemory: enabled } });
  
  // Reinitialize harness with new settings while preserving the current thread.
  await ctx.reinitHarness?.();

  const status = enabled ? `${C_GREEN}enabled${RESET}` : `${C_RED}disabled${RESET}`;
  const scopeLabel = scope === "global" ? "global" : "project";

  const lines = [
    `Working memory ${status} at ${C_CYAN}${scopeLabel}${RESET} scope.`,
    `  Config written to: ${filePath}`,
    `  Harness reset — current thread preserved.`,
  ];

  ctx.setMessages((prev) => [...prev, { role: "system", content: lines.join("\n") }]);
}
