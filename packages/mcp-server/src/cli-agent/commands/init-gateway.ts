import { hasFlag } from "../args.js";
import type { BaseCommandContext } from "../command-context.js";
import {
  DEFAULT_BASE_URL,
  parseGatewayMode,
  writeGatewayConfig,
} from "../config.js";

export async function runInitGateway(ctx: BaseCommandContext): Promise<void> {
  const scope = hasFlag(ctx.flags, "project") ? "project" : "global";
  const force = hasFlag(ctx.flags, "force");
  const mode = parseGatewayMode(ctx.flags.mode);
  if (ctx.flags.mode && !mode) throw new Error(`Invalid --mode "${ctx.flags.mode}".`);

  const result = await writeGatewayConfig({
    scope,
    force,
    baseUrl: ctx.flags["base-url"] ?? DEFAULT_BASE_URL,
    mode,
  });

  if (result.created) {
    console.log(`Created LLM Gateway config: ${result.path}`);
    console.log(`Scope: ${scope}`);
    console.log(`Base URL: ${ctx.flags["base-url"] ?? DEFAULT_BASE_URL}`);
    return;
  }

  console.log(`LLM Gateway config already exists: ${result.path}`);
  console.log(`Run with --force to overwrite it.`);
}
