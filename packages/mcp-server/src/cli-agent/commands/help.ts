import type { BaseCommandContext } from "../command-context.js";

export function runHelp(ctx: BaseCommandContext): void {
  console.log(`CodeMap LLM Gateway ${ctx.version}

Usage:
  codemap --help
  codemap init-gateway [--project] [--force] [--base-url http://localhost:4000/v1]
  codemap doctor
  codemap models
  codemap route "fix a failing migration" [--mode hybrid|local-only|cloud-ok|ask-before-cloud]
  codemap ask "Say hi" [--model fast|strong|local]
  codemap chat [--model fast|strong|local] [--mode hybrid|local-only|cloud-ok|ask-before-cloud] [--no-stream]

Environment:
  CODEMAP_LLM_GATEWAY_BASE_URL       OpenAI-compatible base URL. Default: http://localhost:4000/v1
  CODEMAP_LLM_GATEWAY_API_KEY        Optional bearer token.
  CODEMAP_LLM_GATEWAY_MODE           hybrid | local-only | cloud-ok | ask-before-cloud.
  CODEMAP_LLM_GATEWAY_DEFAULT_MODEL  Default model fallback.
  CODEMAP_LLM_GATEWAY_FAST_MODEL     Fast profile model.
  CODEMAP_LLM_GATEWAY_STRONG_MODEL   Strong profile model.
  CODEMAP_LLM_GATEWAY_LOCAL_MODEL    Local profile model.

Config files:
  .codemap/llm-gateway.json      Project-level routing and model defaults.
  ~/.codemap/llm-gateway.json    User-level default config.

If no config file or environment is present, CodeMap uses built-in defaults and suggests init-gateway.`);
}
