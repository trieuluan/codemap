import { getGatewayConfigPath } from ".././config.js";
import type { GatewayConfig } from "../../agent/types.js";

export function printGatewayHint(config: GatewayConfig): void {
  if (config.configSource !== "built-in defaults") return;
  console.error(`No llm-gateway.json found and no gateway was reachable at ${config.baseUrl}.`);
  console.error(`Run: codemap init-gateway`);
  console.error(`Project config path: ${getGatewayConfigPath("project")}`);
  console.error(`Global config path: ${getGatewayConfigPath("global")}`);
}
