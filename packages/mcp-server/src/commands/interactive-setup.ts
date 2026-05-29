import { execSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  writeGatewayConfig,
  DEFAULT_BASE_URL,
} from "../cli-agent/config.js";

const NINE_ROUTER_LOCAL_PORT = 20128;
const NINE_ROUTER_LOCAL_BASE_URL = `http://localhost:${NINE_ROUTER_LOCAL_PORT}/v1`;

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

function confirm(question: string, defaultValue = true): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const hint = defaultValue ? "(Y/n)" : "(y/N)";
    rl.question(`${question} ${hint} `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (normalized === "") resolve(defaultValue);
      else resolve(normalized === "y" || normalized === "yes");
    });
  });
}

function is9RouterInstalled(): boolean {
  try {
    execSync("which 9router", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function install9Router(): Promise<void> {
  console.log("   Installing 9router globally...");
  execSync("npm install -g 9router", { stdio: "inherit" });
}

function start9Router(): void {
  console.log("   Starting 9router in the background...");
  const child = spawn("9router", ["--port", String(NINE_ROUTER_LOCAL_PORT)], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`);

  console.log("━━━ Gateway Type ━━━");
  console.log("");
  console.log("  1. 9router local (default)  — install and run locally");
  console.log("     • Free, runs on your machine");
  console.log("     • Pre-configured model routing (planner, coder, reviewer)");
  console.log("     • No per-model API keys needed");
  console.log("");
  console.log("  2. 9router Cloud             — managed gateway at 9router.dev");
  console.log("     • Usage-based billing");
  console.log("     • Get your API key at: https://9router.dev/settings/api-keys");
  console.log("");
  console.log("  3. Self-hosted               — run your own gateway");
  console.log("     • Set baseUrl to your gateway URL");
  console.log("     • Useful for local models or custom routing logic");
  console.log("");

  const gatewayChoice = await prompt("Choose gateway type", "1");
  const choice = gatewayChoice.trim();

  let baseUrl: string;
  let nineRouterDashUrl: string | undefined;

  if (choice === "2") {
    // 9router Cloud
    baseUrl = "https://9router.dev/v1";
    nineRouterDashUrl = "https://9router.dev/settings/api-keys";
  } else if (choice === "3") {
    // Self-hosted
    console.log("");
    console.log("━━━ Self-hosted Gateway URL ━━━");
    console.log("Enter the base URL of your gateway (e.g. http://localhost:4000/v1)");
    console.log("");
    baseUrl = await prompt("Gateway base URL", DEFAULT_BASE_URL);
    while (baseUrl) {
      try {
        new URL(baseUrl);
        break;
      } catch {
        console.log("❌ Invalid URL. Please try again.");
        baseUrl = await prompt("Gateway base URL", DEFAULT_BASE_URL);
      }
    }
  } else {
    // 9router local (default)
    console.log("");
    if (!is9RouterInstalled()) {
      console.log("9router is not installed yet.");
      const doInstall = await confirm("Install 9router globally via npm?", true);
      if (doInstall) {
        await install9Router();
      } else {
        console.log("⚠️  Skipping 9router install. You'll need to install it manually: npm install -g 9router");
      }
    }

    if (is9RouterInstalled()) {
      start9Router();
      console.log(`   9router is running at http://localhost:${NINE_ROUTER_LOCAL_PORT}`);
    }

    baseUrl = NINE_ROUTER_LOCAL_BASE_URL;
    nineRouterDashUrl = `http://localhost:${NINE_ROUTER_LOCAL_PORT}/dashboard/endpoint`;
  }

  console.log("");

  // Prompt: API Key
  console.log("━━━ API Key ━━━");
  if (nineRouterDashUrl) {
    console.log(`Get your API key from: ${nineRouterDashUrl}`);
  }
  console.log("Leave empty if your gateway doesn't require auth.");
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
