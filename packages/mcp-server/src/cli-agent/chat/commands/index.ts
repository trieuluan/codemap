import type { GatewayMode, ChatMessage } from "../../types.js";
import type { ChatEntry } from "../ui/chat-terminal.js";
import type { CodeMapMcpToolClient } from "../mcp/mcp-tool-client.js";

import { helpCommand } from "./help.js";
import { clearCommand } from "./clear.js";
import { exitCommand } from "./exit.js";
import { statusCommand } from "./status.js";
import { modelsCommand } from "./models.js";
import { modelCommand } from "./model.js";
import { modeCommand } from "./mode.js";
import { toolsCommand } from "./tools.js";
import { diffCommand } from "./diff.js";
import { historyCommand } from "./history.js";
import { debugCommand } from "./debug.js";
import { retryCommand } from "./retry.js";
import { mcpCommand } from "./mcp.js";
import { compactCommand } from "./compact.js";

import type { CommandContext, Command } from "./types.js";

const commands: Command[] = [
  helpCommand,
  statusCommand,
  modelsCommand,
  modelCommand,
  modeCommand,
  toolsCommand,
  diffCommand,
  clearCommand,
  historyCommand,
  debugCommand,
  compactCommand,
  retryCommand,
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
