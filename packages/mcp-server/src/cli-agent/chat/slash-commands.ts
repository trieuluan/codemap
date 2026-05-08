import { stdout as output } from "node:process";

import type { GatewayConfig, GatewayMode } from "../types.js";
import { printModels } from "../commands/models.js";
import { runRoute } from "../commands/route.js";

export type SlashCommandResult = "continue" | "clear" | "exit";

export function handleChatCommand(
  rawCommand: string,
  config: GatewayConfig,
  mode: GatewayMode | undefined,
): SlashCommandResult {
  const [command, ...args] = rawCommand.split(/\s+/);
  const rest = args.join(" ").trim();

  if (command === "/exit" || command === "/quit") return "exit";
  if (command === "/help") {
    printChatHelp();
    return "continue";
  }
  if (command === "/models") {
    printModels(config);
    return "continue";
  }
  if (command === "/route") {
    if (!rest) {
      console.log('Usage: /route "describe the task"');
      return "continue";
    }
    runRoute(config, rest, mode);
    return "continue";
  }
  if (command === "/clear") {
    clearVisibleChat();
    console.log("Conversation cleared.");
    return "clear";
  }

  console.log(`Unknown command "${command}". Type /help for commands.`);
  return "continue";
}

function printChatHelp(): void {
  console.log(`Chat commands:
  /help       Show chat commands.
  /models     Show configured model profiles.
  /route ...  Recommend a model profile for a task.
  /clear      Clear conversation history.
  /exit       Quit chat.`);
}

function clearVisibleChat(): void {
  if (!output.isTTY) return;
  output.write("\x1B[2J\x1B[3J\x1B[H");
}
