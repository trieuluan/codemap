import type { GatewayCommandContext } from "../command-context.js";
import { NineRouterProvider } from "../provider.js";

export async function runDoctor(ctx: GatewayCommandContext): Promise<void> {
  const config = ctx.config;
  const provider = new NineRouterProvider(config.baseUrl, config.apiKey);
  const health = await provider.healthCheck();
  const status = health.ok ? "ok" : "warning";

  console.log(`CodeMap LLM Gateway ${ctx.version}`);
  console.log(`Config: ${config.configSource}`);
  console.log(`Mode: ${config.mode}`);
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`API key: ${config.apiKey ? "configured" : "not configured"}`);
  console.log(`Provider: ${status} - ${health.message}`);
  console.log(`Profiles: ${config.profiles.length}`);
  if (config.configSource === "built-in defaults") {
    console.log(`No llm-gateway.json found.`);
    console.log(`Run: codemap init-gateway`);
  }
}
