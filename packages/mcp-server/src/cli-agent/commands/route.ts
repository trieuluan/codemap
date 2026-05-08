import { parseModeFlag } from "../args.js";
import type { GatewayCommandContext } from "../command-context.js";
import { recommendRoute } from "../policy.js";
import type { GatewayConfig, GatewayMode, ModelProfile } from "../types.js";

export function runRouteCommand(ctx: GatewayCommandContext): void {
  runRoute(ctx.config, ctx.positional, parseModeFlag(ctx.flags.mode));
}

export function runRoute(
  config: GatewayConfig,
  task: string,
  mode: GatewayMode | undefined,
): void {
  if (!task) throw new Error('Missing task. Example: codemap route "fix a failing migration"');
  const recommendation = recommendRoute({ task, mode }, config);
  console.log(`Task type: ${recommendation.taskType}`);
  console.log(`Risk: ${recommendation.risk}`);
  console.log(`Mode: ${recommendation.mode}`);
  console.log(formatProfile("Model", recommendation.profile));
  if (recommendation.fallbackProfile) {
    console.log(formatProfile("Fallback", recommendation.fallbackProfile));
  }
  console.log("Reasons:");
  for (const reason of recommendation.reasons) {
    console.log(`- ${reason}`);
  }
}

function formatProfile(label: string, profile: ModelProfile): string {
  const locality = profile.local ? "local" : "remote";
  return `${label}: ${profile.id} -> ${profile.model} (${profile.tier}, ${locality})`;
}
