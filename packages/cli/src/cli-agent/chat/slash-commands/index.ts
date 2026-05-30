import { helpCommand } from "./help.js";
import { clearCommand } from "./clear.js";
import { exitCommand } from "./exit.js";
import { statusCommand } from "./status.js";
import { modelsCommand } from "./models.js";
import { toolsCommand } from "./tools.js";
import { diffCommand } from "./diff.js";
import { historyCommand } from "./history.js";
import { debugCommand } from "./debug.js";
import { mcpCommand } from "./mcp.js";
import { gitCommitCommand } from "./git-commit.js";
import { gitPushCommand } from "./git-push.js";
import { gitPrCommand } from "./git-pr.js";
import { sessionsCommand } from "./sessions.js";
import { conventionsCommand } from "./conventions.js";
import { copyCommand } from "./copy-cmd.js";
import { loginCommand } from "./login.js";
import { logoutCommand } from "./logout.js";
import { projectsCommand } from "./projects.js";
import { linkCommand } from "./link.js";
import { createCommand } from "./create.js";
import { importCommand } from "./import.js";

import type { CommandContext, Command } from "./types.js";

const commands: Command[] = [
  helpCommand,
  statusCommand,
  loginCommand,
  logoutCommand,
  projectsCommand,
  linkCommand,
  createCommand,
  importCommand,
  modelsCommand,
  toolsCommand,
  diffCommand,
  gitCommitCommand,
  gitPushCommand,
  gitPrCommand,
  sessionsCommand,
  conventionsCommand,
  copyCommand,
  clearCommand,
  historyCommand,
  debugCommand,
  mcpCommand,
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
