import { execSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { writeGatewayConfig, DEFAULT_BASE_URL } from "../cli-agent/config.js";

const NINE_ROUTER_LOCAL_PORT = 20128;
const NINE_ROUTER_LOCAL_BASE_URL = `http://localhost:${NINE_ROUTER_LOCAL_PORT}/v1`;

function prompt(question: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const display = defaultValue
      ? `${question} [${defaultValue}] `
      : `${question} `;
    rl.question(display, (answer) => {
      rl.close();
      resolve(answer || defaultValue || "");
    });
  });
}

interface SelectOption {
  label: string;
  description?: string;
  value: string;
}

function select(question: string, options: SelectOption[]): Promise<string> {
  return new Promise((resolve) => {
    let current = 0;
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    // Prevent normal line buffering
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const render = () => {
      // Move cursor up to overwrite previous render
      if (rendered > 0) {
        process.stdout.write(`\x1b[${rendered}A`);
      }
      process.stdout.write(`\r${question}\n`);
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const prefix = i === current ? "❯ " : "  ";
        const line = `${prefix}${opt.label}${opt.description ? ` — ${opt.description}` : ""}`;
        // Clear line then write
        process.stdout.write(`\x1b[2K${line}\n`);
      }
      rendered = options.length + 1;
    };

    let rendered = 0;
    render();

    const onData = (key: string) => {
      if (key === "\u001b[A") {
        // Up arrow
        current = (current - 1 + options.length) % options.length;
        render();
      } else if (key === "\u001b[B") {
        // Down arrow
        current = (current + 1) % options.length;
        render();
      } else if (key === "\r" || key === "\n") {
        // Enter
        cleanup();
        process.stdout.write("\n");
        resolve(options[current].value);
      } else if (key >= "1" && key <= String(options.length)) {
        // Number shortcut
        cleanup();
        process.stdout.write("\n");
        resolve(options[Number(key) - 1].value);
      } else if (key === "\u0003") {
        // Ctrl+C
        cleanup();
        process.exit(0);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      rl.close();
    };

    process.stdin.on("data", onData);
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

interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface ModelsResponse {
  data: ModelInfo[];
  object: string;
}

async function fetchModels(
  baseUrl: string,
  apiKey?: string,
): Promise<ModelInfo[]> {
  const url = `${baseUrl}/models`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`⚠️  Failed to fetch models: HTTP ${response.status}`);
      return [];
    }

    const data = (await response.json()) as ModelsResponse;
    return data.data || [];
  } catch (error) {
    console.log("⚠️  Could not connect to API to fetch models.");
    return [];
  }
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

async function is9RouterRunning(): Promise<boolean> {
  try {
    await fetch(`http://localhost:${NINE_ROUTER_LOCAL_PORT}/v1/models`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    // Any response (even 401/403) means the server is running
    return true;
  } catch (err) {
    return false;
  }
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
║                    🚀 CodeMap Setup                              ║
╚══════════════════════════════════════════════════════════════════╝

CodeMap needs an LLM API to power its AI features.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 How it works
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CodeMap sends prompts to any OpenAI-compatible API endpoint.
You can use OpenAI, OpenRouter, a local model, or 9router — whichever you prefer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`);

  console.log("━━━ API Provider ━━━");
  console.log("");

  const choice = await select("Choose API provider:", [
    {
      value: "1",
      label: "9router local (recommended)",
      description: "free, runs on your machine",
    },
    {
      value: "2",
      label: "OpenAI-compatible API",
      description: "use your own API key",
    },
    {
      value: "3",
      label: "Self-hosted",
      description: "run your own gateway",
    },
  ]);

  let baseUrl: string;
  let nineRouterDashUrl: string | undefined;

  if (choice === "2") {
    // OpenAI-compatible API
    console.log("");
    console.log("━━━ OpenAI-compatible API ━━━");
    console.log("Common base URLs:");
    console.log("  • OpenAI:     https://api.openai.com/v1");
    console.log("  • OpenRouter: https://openrouter.ai/api/v1");
    console.log("");
    baseUrl = await prompt("Base URL", "https://api.openai.com/v1");
    while (baseUrl) {
      try {
        new URL(baseUrl);
        break;
      } catch {
        console.log("❌ Invalid URL. Please try again.");
        baseUrl = await prompt("Base URL", "https://api.openai.com/v1");
      }
    }
  } else if (choice === "3") {
    // Self-hosted
    console.log("");
    console.log("━━━ Self-hosted Gateway URL ━━━");
    console.log(
      "Enter the base URL of your gateway (e.g. http://localhost:4000/v1)",
    );
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
      const doInstall = await confirm(
        "Install 9router globally via npm?",
        true,
      );
      if (doInstall) {
        await install9Router();
      } else {
        console.log(
          "⚠️  Skipping 9router install. You'll need to install it manually: npm install -g 9router",
        );
      }
    }

    if (is9RouterInstalled()) {
      if (await is9RouterRunning()) {
        console.log(
          `   9router is already running at http://localhost:${NINE_ROUTER_LOCAL_PORT}`,
        );
      } else {
        start9Router();
        console.log(
          `   9router started at http://localhost:${NINE_ROUTER_LOCAL_PORT}`,
        );
      }
    }

    baseUrl = NINE_ROUTER_LOCAL_BASE_URL;
    nineRouterDashUrl = `http://localhost:${NINE_ROUTER_LOCAL_PORT}/dashboard/endpoint`;
  }

  console.log("");

  // Prompt: API Key
  console.log("━━━ API Key ━━━");
  if (nineRouterDashUrl) {
    console.log(`Get your API key from: ${nineRouterDashUrl}`);
    console.log("Leave empty if your gateway doesn't require auth.");
  } else if (choice === "2") {
    console.log("Enter your API key for the provider.");
  } else {
    console.log("Leave empty if your gateway doesn't require auth.");
  }
  console.log("");
  const apiKey = await prompt("API key (press Enter to skip)", "");

  console.log("");

  // Prompt: Default Model
  console.log("━━━ Default Model ━━━");
  console.log("Fetching available models...");
  console.log("");

  let defaultModel = "coder";
  const models = await fetchModels(baseUrl, apiKey || undefined);

  if (models.length > 0) {
    console.log(`Found ${models.length} model(s):`);
    console.log("");

    const modelOptions: SelectOption[] = models.slice(0, 20).map((m) => ({
      value: m.id,
      label: m.id,
      description: m.owned_by,
    }));

    // Add option to enter custom model ID
    modelOptions.push({
      value: "__custom__",
      label: "Enter custom model ID",
      description: "type your own model name",
    });

    const selectedModel = await select("Choose default model:", modelOptions);

    if (selectedModel === "__custom__") {
      defaultModel = await prompt("Model ID", "");
      if (!defaultModel) {
        defaultModel = "coder";
        console.log("Using default profile: coder");
      }
    } else {
      defaultModel = selectedModel;
    }
  } else {
    console.log("No models returned by the API.");
    console.log("");
    console.log("You can enter a model ID manually, or use a profile label:");
    console.log("  • coder    — for code generation tasks");
    console.log("  • planner  — for planning and reasoning");
    console.log("  • reviewer — for code review tasks");
    console.log("");
    console.log("Leave empty to use 'coder' profile.");
    console.log("");

    defaultModel = await prompt("Model ID or profile", "coder");
    if (!defaultModel) {
      defaultModel = "coder";
    }
  }

  console.log("");
  console.log(`   Default model set to: ${defaultModel}`);
  console.log("");

  // Prompt 3: Global or Project
  console.log("━━━ Config Scope ━━━");
  console.log("");
  let scope: "global" | "project" = "global";
  const scopeChoice = await select("Save config to:", [
    {
      value: "global",
      label: "Global",
      description: "~/.codemap/llm-gateway.json (all projects)",
    },
    {
      value: "project",
      label: "Project",
      description: ".codemap/llm-gateway.json (current project only)",
    },
  ]);
  scope = scopeChoice as "global" | "project";

  // Write config with API key
  const result = await writeGatewayConfig({
    scope,
    force: true,
    baseUrl,
    apiKey: apiKey || undefined,
    defaultModel,
  });

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Config saved to: ${result.path}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current settings:
  • Base URL:      ${baseUrl}
  • API Key:       ${apiKey ? apiKey.substring(0, 10) + "...***" : "(not set)"}
  • Default Model: ${defaultModel}
  • Scope:         ${scope}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Advanced: Environment Variables
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You can override config using environment variables:

  CODEMAP_LLM_GATEWAY_BASE_URL        API base URL
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
