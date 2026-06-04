import type { Command } from "./types.js";
import {
  loadProjectHooks,
  saveProjectHooks,
  loadGlobalHooks,
  saveGlobalHooks,
  loadCodemapHooks,
  type HookEventName,
  type HookDefinition,
} from "../../agent/tools/hooks/index.js";
import { reloadHooks } from "../../agent/runtime/harness-runtime.js";
import { readWorkspacePath } from "@codemap/core/lib/workspace-project.js";

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const C_GRAY = "\x1b[38;2;107;114;128m";
const C_GREEN = "\x1b[38;2;34;197;94m";
const C_YELLOW = "\x1b[38;2;250;204;21m";
const C_CYAN = `${BOLD}\x1b[38;2;0;229;255m`;
const C_RED = "\x1b[38;2;239;68;68m";

const VALID_EVENTS: HookEventName[] = [
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "UserPromptSubmit",
  "SessionStart",
  "SessionEnd",
  "Notification",
];

export const hooksCommand: Command = {
  name: "hooks",
  description: "Manage lifecycle hooks: list, add, remove, reload",
  execute: async (args, ctx) => {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];

    if (!sub) {
      return showHooks(ctx);
    }

    if (sub === "add") {
      return addHook(parts.slice(1), ctx);
    }

    if (sub === "remove") {
      return removeHook(parts.slice(1), ctx);
    }

    if (sub === "reload") {
      ctx.setBusy(true);
      try {
        reloadHooks();
        ctx.setMessages((prev) => [
          ...prev,
          { role: "system", content: `${C_GREEN}Hooks reloaded${RESET} — .mastracode/hooks.json updated.` },
        ]);
      } catch (err) {
        ctx.setMessages((prev) => [
          ...prev,
          { role: "system", content: `${C_RED}Failed to reload hooks:${RESET} ${err}` },
        ]);
      }
      ctx.setBusy(false);
      return;
    }

    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `${BOLD}Usage:${RESET}`,
          "  /hooks           List all hooks",
          "  /hooks add       Add a hook (run /hooks add for full help)",
          "  /hooks remove    Remove a hook by index",
          "  /hooks reload    Reload hooks from .codemap/hooks.json",
        ].join("\n"),
      },
    ]);
  },
};

async function showHooks(ctx: Parameters<Command["execute"]>[1]) {
  const workspaceRoot = await readWorkspacePath();
  const merged = loadCodemapHooks(workspaceRoot);

  const lines: string[] = [
    `${BOLD}Lifecycle Hooks${RESET}`,
    "",
  ];

  for (const event of VALID_EVENTS) {
    const eventHooks = merged[event] ?? [];
    if (eventHooks.length === 0) continue;

    lines.push(`${C_CYAN}${BOLD}${event}${RESET}  ${C_GRAY}${eventHooks.length} hook(s)${RESET}`);
    lines.push(`${C_GRAY}${"─".repeat(70)}${RESET}`);

    for (let i = 0; i < eventHooks.length; i++) {
      const hook = eventHooks[i];
      const matcher = hook?.matcher?.tool_name
        ? ` ${C_GRAY}matcher: /${hook.matcher.tool_name}/${RESET}`
        : "";
      const desc = hook?.description ? ` ${C_GRAY}— ${hook.description}${RESET}` : "";
      lines.push(`  ${C_GRAY}${String(i).padStart(2)}.${RESET} ${hook?.command}${matcher}${desc}`);
    }
    lines.push("");
  }

  const totalHooks = Object.values(merged).reduce(
    (sum, hooks) => sum + (hooks?.length ?? 0),
    0,
  );
  if (totalHooks === 0) {
    lines.push(`${C_GRAY}No hooks configured.${RESET}`);
    lines.push("");
  }

  lines.push(
    `${C_GRAY}Add: /hooks add <event> <command> [--matcher <regex>] [--global]${RESET}`,
  );
  lines.push(
    `${C_GRAY}Remove: /hooks remove <event> <index> • Reload: /hooks reload${RESET}`,
  );

  ctx.setMessages((prev) => [
    ...prev,
    { role: "system", content: lines.join("\n") },
  ]);
}

async function addHook(
  args: string[],
  ctx: Parameters<Command["execute"]>[1],
) {
  if (args.length < 2) {
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `${C_RED}Usage:${RESET} /hooks add <event> <command> [options]`,
          "",
          `${BOLD}Events:${RESET}`,
          `  ${C_CYAN}PreToolUse${RESET}      Before a tool runs (blocking — can approve/reject)`,
          `  ${C_CYAN}PostToolUse${RESET}     After a tool finishes`,
          `  ${C_CYAN}Stop${RESET}            Before the agent stops (blocking)`,
          `  ${C_CYAN}UserPromptSubmit${RESET} Before user prompt is processed (blocking)`,
          `  ${C_CYAN}SessionStart${RESET}    When a session begins`,
          `  ${C_CYAN}SessionEnd${RESET}      When a session ends`,
          `  ${C_CYAN}Notification${RESET}    Non-blocking notifications (fire-and-forget)`,
          "",
          `${BOLD}Options:${RESET}`,
          "  --matcher <regex>   Match specific tool names (PreToolUse/PostToolUse)",
          "  --global            Save to ~/.codemap/hooks.json (default: project)",
          "",
          `${BOLD}Examples:${RESET}`,
          `  /hooks add PreToolUse "eslint --fix {{file_path}}" --matcher write_file`,
          `  /hooks add SessionStart "echo 'Project loaded'"`,
          `  /hooks add PreToolUse "echo BLOCK" --matcher execute_command --global`,
        ].join("\n"),
      },
    ]);
    return;
  }

  const event = args[0] as HookEventName;
  if (!VALID_EVENTS.includes(event)) {
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: `${C_RED}Invalid event:${RESET} "${event}". Valid: ${VALID_EVENTS.join(", ")}`,
      },
    ]);
    return;
  }

  // Parse flags
  let matcherRegex: string | undefined;
  let isGlobal = false;
  const commandParts: string[] = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--matcher" && i + 1 < args.length) {
      matcherRegex = args[++i];
    } else if (args[i] === "--global") {
      isGlobal = true;
    } else {
      commandParts.push(args[i]);
    }
  }

  const command = commandParts.join(" ");
  if (!command) {
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: `${C_RED}Command cannot be empty.${RESET}` },
    ]);
    return;
  }

  const hook: HookDefinition = {
    type: "command",
    command,
    description: `User hook for ${event}`,
  };
  if (matcherRegex) {
    hook.matcher = { tool_name: matcherRegex };
  }

  if (isGlobal) {
    const globalHooks = loadGlobalHooks();
    if (!globalHooks[event]) {
      globalHooks[event] = [];
    }
    globalHooks[event]!.push(hook);
    saveGlobalHooks(globalHooks);
  } else {
    const workspaceRoot = await readWorkspacePath();
    const projectHooks = loadProjectHooks(workspaceRoot);
    if (!projectHooks[event]) {
      projectHooks[event] = [];
    }
    projectHooks[event]!.push(hook);
    saveProjectHooks(workspaceRoot, projectHooks);
  }

  // Sync to Mastra
  reloadHooks();

  const matcher = matcherRegex ? ` (matcher: /${matcherRegex}/)` : "";
  const scope = isGlobal ? "global" : "project";
  ctx.setMessages((prev) => [
    ...prev,
    {
      role: "system",
      content: `${C_GREEN}Added ${scope} hook${RESET} to ${C_CYAN}${event}${RESET}: ${command}${matcher}`,
    },
  ]);
}

async function removeHook(
  args: string[],
  ctx: Parameters<Command["execute"]>[1],
) {
  if (args.length < 2) {
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: `${C_RED}Usage:${RESET} /hooks remove <event> <index>`,
      },
    ]);
    return;
  }

  const event = args[0] as HookEventName;
  const index = parseInt(args[1], 10);

  if (!VALID_EVENTS.includes(event)) {
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: `${C_RED}Invalid event:${RESET} "${event}". Valid: ${VALID_EVENTS.join(", ")}`,
      },
    ]);
    return;
  }

  if (isNaN(index)) {
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: `${C_RED}Index must be a number.${RESET}` },
    ]);
    return;
  }

  const workspaceRoot = await readWorkspacePath();
  const userHooks = loadProjectHooks(workspaceRoot);
  const hooks = userHooks[event];

  if (!hooks || hooks.length === 0) {
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: `${C_YELLOW}No user hooks found for ${event}.${RESET} Use /hooks to see available indices.`,
      },
    ]);
    return;
  }

  // Find the nth user hook in the merged list
  // Indices shown in /hooks correspond directly to user hooks now
  // that built-in hooks have been removed.
  if (index < 0 || index >= hooks.length) {
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: `${C_RED}Index ${index} out of range.${RESET} User hooks for ${event}: 0–${hooks.length - 1}`,
      },
    ]);
    return;
  }

  const removed = hooks.splice(index, 1)[0];
  if (hooks.length === 0) {
    delete userHooks[event];
  }
  saveProjectHooks(workspaceRoot, userHooks);

  // Sync to Mastra
  reloadHooks();

  ctx.setMessages((prev) => [
    ...prev,
    {
      role: "system",
      content: `${C_GREEN}Removed hook${RESET} from ${C_CYAN}${event}${RESET}: ${removed.command}`,
    },
  ]);
}
