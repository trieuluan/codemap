import { executeSharedCommand } from "./shared-bridge.js";
import {
  helpCommand as sharedHelp,
  statusCommand as sharedStatus,
  modelsCommand as sharedModels,
} from "@codemap-ai/shared";
import { clearCommand } from "./clear.js";
import { exitCommand } from "./exit.js";
import { toolsCommand } from "./tools.js";
import { diffCommand } from "./diff.js";
import { historyCommand } from "./history.js";
import { debugCommand } from "./debug.js";
import { mcpCommand } from "./mcp.js";
import { gitCommitCommand } from "./git-commit.js";
import { gitPushCommand } from "./git-push.js";
import { gitPrCommand } from "./git-pr.js";
import { copyCommand } from "./copy-cmd.js";
import { loginCommand } from "./login.js";
import { logoutCommand } from "./logout.js";
import { projectsCommand } from "./projects.js";
import { linkCommand } from "./link.js";
import { createCommand } from "./create.js";
import { importCommand } from "./import.js";
import { sessionsCommand } from "./sessions.js";
import { hooksCommand } from "./hooks.js";
import { configCommand } from "./config.js";
import { memoryCommand } from "./memory.js";
import type { CommandContext, Command } from "./types.js";

/** Wrap a shared command as a CLI Command. */
function wrapShared(name: string, description: string, shared: typeof sharedHelp): Command {
  return {
    name,
    description,
    execute: async (args, ctx) => {
      await executeSharedCommand(shared, args, ctx);
    },
  };
}

const commands: Command[] = [
  wrapShared("help", "Show this help", sharedHelp),
  wrapShared("status", "Show model, session, and workspace status", sharedStatus),
  wrapShared("models", "Switch the active model", sharedModels),
  loginCommand,
  logoutCommand,
  projectsCommand,
  linkCommand,
  createCommand,
  importCommand,
  toolsCommand,
  diffCommand,
  gitCommitCommand,
  gitPushCommand,
  gitPrCommand,
  copyCommand,
  clearCommand,
  historyCommand,
  sessionsCommand,
  debugCommand,
  mcpCommand,
  hooksCommand,
  configCommand,
  memoryCommand,
  exitCommand,
];

export function getCommandList(): Command[] {
  return commands;
}

export function executeCommand(
  text: string,
  ctx: CommandContext,
): boolean {
  const [cmd] = text.split(/\s+/);
  const command = commands.find((c) => `/${c.name}` === cmd);
  if (!command) return false;
  command.execute(text.slice(cmd.length).trim(), ctx);
  return true;
}
