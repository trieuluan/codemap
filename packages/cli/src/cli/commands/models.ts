import type { GatewayCommandContext } from ".././command-context.js";
import { NineRouterProvider } from "../../agent/loop/provider.js";
import type { GatewayConfig } from "../../agent/types.js";

export async function runModels(ctx: GatewayCommandContext): Promise<void> {
  printModels(ctx.config);
  await printGatewayModels(ctx);
}

export function printModels(config: GatewayConfig): void {
  console.log(`Default model: ${config.defaultModel}`);
}

async function printGatewayModels(ctx: GatewayCommandContext): Promise<void> {
  const provider = new NineRouterProvider(ctx.config.baseUrl, ctx.config.apiKey);

  console.log("");
  console.log("Available gateway models:");
  try {
    const models = await provider.listModelDetails();
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
