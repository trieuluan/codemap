import { createRequire } from "node:module";

import { parseArgs } from "./args.js";
import { createBaseContext } from "./command-context.js";
import { runChat } from "../commands/chat.js";
import { loadGatewayConfig } from "./config.js";
import { loadDotEnv } from "./env.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

/** Thin entry point used by src/cli-agent.ts. Runs the chat by default. */
export async function runCliAgent(argv: string[]): Promise<void> {
  await loadDotEnv();
  const parsed = parseArgs(argv);
  const baseCtx = createBaseContext(argv, parsed, version);
  const config = await loadGatewayConfig();
  await runChat({ ...baseCtx, config });
}
