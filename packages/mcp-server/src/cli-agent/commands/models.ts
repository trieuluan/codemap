import type { GatewayCommandContext } from "../command-context.js";
import { NineRouterProvider } from "../provider.js";
import type { GatewayConfig } from "../types.js";

export async function runModels(ctx: GatewayCommandContext): Promise<void> {
  printModels(ctx.config);
  await printGatewayModels(ctx);
}

export function printModels(config: GatewayConfig): void {
  console.log("Configured routing profiles:");
  for (const profile of config.profiles) {
    const local = profile.local ? "local" : "remote";
    console.log(`- ${profile.id}: ${profile.model} (${profile.tier}, ${local})`);
  }
}

async function printGatewayModels(ctx: GatewayCommandContext): Promise<void> {
  const provider = new NineRouterProvider(ctx.config.baseUrl, ctx.config.apiKey);

  console.log("");
  console.log("Available gateway models:");
  try {
    const models = (await provider.listModelDetails()).filter(
      (model) => model.ownedBy !== "combo",
    );
    if (models.length === 0) {
      console.log("- none returned by gateway");
      return;
    }
    for (const model of models) {
      console.log(`- ${model.id}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`- unavailable (${message})`);
  }
}
