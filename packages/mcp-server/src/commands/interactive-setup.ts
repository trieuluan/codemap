import { createInterface } from "node:readline";
import {
  writeGatewayConfig,
  DEFAULT_BASE_URL,
} from "../cli-agent/config.js";

function prompt(question: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const display = defaultValue ? `${question} [${defaultValue}] ` : `${question} `;
    rl.question(display, (answer) => {
      rl.close();
      resolve(answer || defaultValue || "");
    });
  });
}

export async function runInteractiveSetup(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    🚀 CodeMap Gateway Setup                      ║
╚══════════════════════════════════════════════════════════════════╝

CodeMap needs a LLM gateway to power its AI features.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 What is a Gateway?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The gateway is a proxy that routes your requests to LLM providers.
It manages model routing, load balancing, and token accounting.

• 9router (default): The managed gateway at 9router.dev
  - Pre-configured model routing (planner, coder, reviewer)
  - Usage-based billing, no per-model API keys needed
  - Get your API key at: https://9router.dev/settings/api-keys

• Self-hosted: Run your own gateway with OpenAI-compatible API
  - Set baseUrl to your gateway URL (e.g., http://localhost:4000/v1)
  - Useful for local models or custom routing logic

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 Default Model
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CodeMap uses a single model for all tasks. The gateway handles
routing automatically based on the model ID.

Default model: coder (resolved by your gateway)

To use a specific model, override in llm-gateway.json:
  "defaultModel": "gpt-4o", "claude-sonnet-4-5", etc.

Or via env var:
  CODEMAP_LLM_GATEWAY_DEFAULT_MODEL=gpt-4o

You only need to set:
  1. Gateway URL (where to send requests)
  2. API Key (for authentication, if required)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`);

  // Prompt 1: Base URL
  console.log("━━━ Gateway Base URL ━━━");
  console.log("The URL of your LLM gateway endpoint.");
  console.log("For 9router: https://9router.dev/v1");
  console.log("For local:   http://localhost:4000/v1");
  console.log("");
  let baseUrl = await prompt("Gateway base URL", DEFAULT_BASE_URL);
  while (baseUrl) {
    try {
      new URL(baseUrl);
      break;
    } catch {
      console.log("❌ Invalid URL. Please try again.");
      baseUrl = await prompt("Gateway base URL", DEFAULT_BASE_URL);
    }
  }

  console.log("");

  // Prompt 2: API Key
  console.log("━━━ API Key ━━━");
  console.log("Your gateway API key for authentication.");
  console.log("• For 9router: get key from https://9router.dev/settings/api-keys");
  console.log("• For local/self-hosted: may be optional");
  console.log("• Leave empty if your gateway doesn't require auth");
  console.log("");
  const apiKey = await prompt(
    "API key (press Enter to skip)",
    ""
  );

  console.log("");

  // Prompt 3: Global or Project
  console.log("━━━ Config Scope ━━━");
  console.log("• global  — ~/.codemap/llm-gateway.json (default, all projects)");
  console.log("• project — .codemap/llm-gateway.json (current project only)");
  console.log("");
  let scope: "global" | "project" = "global";
  const scopeInput = await prompt(
    "Save config to",
    "global"
  );
  if (scopeInput === "project") {
    scope = "project";
  }

  // Write config with API key
  const result = await writeGatewayConfig({
    scope,
    force: true,
    baseUrl,
    apiKey: apiKey || undefined,
  });

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Config saved to: ${result.path}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current settings:
  • Base URL:  ${baseUrl}
  • API Key:   ${apiKey ? apiKey.substring(0, 10) + "...***" : "(not set)"}
  • Scope:     ${scope}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Advanced: Environment Variables
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You can override config using environment variables:

  CODEMAP_LLM_GATEWAY_BASE_URL        Gateway URL
  CODEMAP_LLM_GATEWAY_API_KEY         API key
  CODEMAP_LLM_GATEWAY_PLANNER_MODEL   Planner model ID
  CODEMAP_LLM_GATEWAY_CODER_MODEL     Coder model ID
  CODEMAP_LLM_GATEWAY_REVIEWER_MODEL  Reviewer model ID
  CODEMAP_LLM_GATEWAY_LOCAL_MODEL     Local model ID

Example:
  export CODEMAP_LLM_GATEWAY_API_KEY=sk-xxxxx
  export CODEMAP_LLM_GATEWAY_CODER_MODEL=gpt-4o

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 Next Steps
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run "codemap" again to start chatting.

Useful commands:
  codemap models        — List available models
  codemap doctor        — Check gateway connection
  codemap init-gateway  — Re-configure gateway settings

`);
}
