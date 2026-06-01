import type { Flags, ParsedArgs } from "./args.js";
import type { GatewayConfig } from "../agent/types.js";

export interface BaseCommandContext {
  argv: string[];
  flags: Flags;
  positional: string;
  version: string;
}

export interface GatewayCommandContext extends BaseCommandContext {
  config: GatewayConfig;
}

export function createBaseContext(
  argv: string[],
  parsed: ParsedArgs,
  version: string,
): BaseCommandContext {
  return {
    argv,
    flags: parsed.flags,
    positional: parsed.positional,
    version,
  };
}
