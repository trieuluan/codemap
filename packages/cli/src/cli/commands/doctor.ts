import type { GatewayCommandContext } from ".././command-context.js";
import { NineRouterProvider } from "../../agent/core/provider.js";
import { getGatewayConfigPath } from ".././config.js";
import type { GatewayConfig } from "../../agent/types.js";
import { getWorkspaceStatusLines } from "./status.js";

export async function runDoctor(ctx: GatewayCommandContext): Promise<void> {
  const lines = await getWorkspaceStatusLines();
  lines.push("", `CodeMap LLM Gateway ${ctx.version}`);
  lines.push(...(await getGatewayDoctorLines(ctx)));
  console.log(lines.join("\n"));
}

async function getGatewayDoctorLines(ctx: GatewayCommandContext): Promise<string[]> {
  const config = ctx.config;
  const provider = new NineRouterProvider(config.baseUrl, config.apiKey);
  const health = await provider.healthCheck();
  const status = health.ok ? "ok" : "warning";
  const lines = [
    `Config: ${config.configSource}`,
    `Base URL: ${config.baseUrl}`,
    `API key: ${config.apiKey ? "configured" : "not configured"}`,
    `Provider: ${status} - ${health.message}`,
    `Default model: ${config.defaultModel}`,
  ];

  if (config.configSource === "built-in defaults") {
    lines.push(`No settings.json found.`);
    lines.push(`Project config path: ${await getGatewayConfigPath("project")}`);
    lines.push(`Global config path: ${await getGatewayConfigPath("global")}`);
  }

  return lines;
}

export async function printGatewayHint(config: GatewayConfig): Promise<void> {
  if (config.configSource !== "built-in defaults") return;
  console.error(`No settings.json found and no gateway was reachable at ${config.baseUrl}.`);
  console.error(`Project config path: ${await getGatewayConfigPath("project")}`);
  console.error(`Global config path: ${await getGatewayConfigPath("global")}`);
}
