import { createRequire } from "node:module";

import { parseArgs } from "./args.js";
import { createBaseContext } from "./command-context.js";
import { runAsk } from "./commands/ask.js";
import { runChat } from "./commands/chat.js";
import { runDoctor } from "./commands/doctor.js";
import { runHelp } from "./commands/help.js";
import { runInitGateway } from "./commands/init-gateway.js";
import { runModels } from "./commands/models.js";
import { runRouteCommand } from "./commands/route.js";
import { loadGatewayConfig } from "./config.js";
import { loadDotEnv } from "./env.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

export async function runCliAgent(argv: string[]): Promise<void> {
  await loadDotEnv();

  const parsed = parseArgs(argv);
  const baseContext = createBaseContext(argv, parsed, version);

  if (parsed.command === "help") {
    runHelp(baseContext);
    return;
  }
  if (parsed.command === "init-gateway") {
    await runInitGateway(baseContext);
    return;
  }

  const config = await loadGatewayConfig();
  const context = { ...baseContext, config };

  if (parsed.command === "doctor") {
    await runDoctor(context);
    return;
  }
  if (parsed.command === "models") {
    await runModels(context);
    return;
  }
  if (parsed.command === "route") {
    runRouteCommand(context);
    return;
  }
  if (parsed.command === "ask") {
    await runAsk(context);
    return;
  }
  if (parsed.command === "chat") {
    await runChat(context);
    return;
  }
}
