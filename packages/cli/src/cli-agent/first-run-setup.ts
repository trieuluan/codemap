import { execSync, spawn } from "node:child_process";
import {
  Container,
  Input,
  Key,
  matchesKey,
  ProcessTerminal,
  SelectList,
  type SelectItem,
  Spacer,
  Text,
  TUI,
} from "@earendil-works/pi-tui";
import { writeGatewayConfig, DEFAULT_BASE_URL } from "../cli-agent/config.js";
import {
  BOLD,
  C_ACTION,
  C_ERROR,
  C_GRAY,
  C_SUCCESS,
  C_WHITE,
  C_YELLOW,
  RESET,
  SPINNER,
} from "../cli-agent/chat/ui/pi-tui/theme.js";

const NINE_ROUTER_LOCAL_PORT = 20128;
const NINE_ROUTER_LOCAL_BASE_URL = `http://localhost:${NINE_ROUTER_LOCAL_PORT}/v1`;

// ── Theme ─────────────────────────────────────────────────────────────

const SELECT_THEME = {
  selectedPrefix: (t: string) => `${C_ACTION}❯ ${t}${RESET}`,
  selectedText:   (t: string) => `${C_WHITE}${BOLD}${t}${RESET}`,
  description:    (t: string) => `  ${C_GRAY}${t}${RESET}`,
  scrollInfo:     (t: string) => `${C_GRAY}${t}${RESET}`,
  noMatch:        (t: string) => `${C_GRAY}${t}${RESET}`,
};

// ── Business logic helpers (unchanged) ────────────────────────────────

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
      return [];
    }

    const data = (await response.json()) as ModelsResponse;
    return data.data || [];
  } catch {
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
  execSync("npm install -g 9router", { stdio: "inherit" });
}

async function is9RouterRunning(): Promise<boolean> {
  try {
    await fetch(`http://localhost:${NINE_ROUTER_LOCAL_PORT}/v1/models`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return true;
  } catch {
    return false;
  }
}

function start9Router(): void {
  const child = spawn("9router", ["--port", String(NINE_ROUTER_LOCAL_PORT)], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

// ── TUI step helpers ──────────────────────────────────────────────────

function showSelectScreen(
  lines: string[],
  items: SelectItem[],
): Promise<string> {
  return new Promise((resolve) => {
    const terminal = new ProcessTerminal();
    terminal.clearScreen();
    const tui = new TUI(terminal, false);
    const root = new Container();

    for (const line of lines) {
      root.addChild(new Text(line));
    }
    root.addChild(new Spacer(1));

    const select = new SelectList(items, items.length, SELECT_THEME);
    select.onSelect = (item) => {
      tui.stop();
      resolve(item.value);
    };
    select.onCancel = () => {
      tui.stop();
      resolve("__back__");
    };

    root.addChild(select);
    tui.addChild(root);
    tui.setFocus(select);

    tui.addInputListener((data) => {
      if (matchesKey(data, Key.ctrl("c"))) {
        tui.stop();
        process.exit(0);
      }
      select.handleInput(data);
      tui.requestRender();
      return { consume: true };
    });

    tui.start();
  });
}

function showInputScreen(
  lines: string[],
  defaultValue?: string,
): Promise<string> {
  return new Promise((resolve) => {
    const terminal = new ProcessTerminal();
    terminal.clearScreen();
    const tui = new TUI(terminal, false);
    const root = new Container();

    for (const line of lines) {
      root.addChild(new Text(line));
    }
    root.addChild(new Spacer(1));

    const promptLabel = defaultValue
      ? `${C_ACTION}> ${RESET}${C_GRAY}[${defaultValue}]${RESET} `
      : `${C_ACTION}> ${RESET}`;

    const label = new Text(promptLabel);
    const input = new Input();
    if (defaultValue) {
      input.setValue(defaultValue);
    }

    input.onSubmit = (value) => {
      tui.stop();
      resolve(value || defaultValue || "");
    };
    input.onEscape = () => {
      tui.stop();
      resolve("__back__");
    };

    root.addChild(label);
    root.addChild(input);
    tui.addChild(root);
    tui.setFocus(input);

    tui.addInputListener((data) => {
      if (matchesKey(data, Key.ctrl("c"))) {
        tui.stop();
        process.exit(0);
      }
      input.handleInput(data);
      tui.requestRender();
      return { consume: true };
    });

    tui.start();
  });
}

function showStatusScreen(lines: string[], durationMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    const terminal = new ProcessTerminal();
    const tui = new TUI(terminal, false);
    const root = new Container();

    for (const line of lines) {
      root.addChild(new Text(line));
    }

    tui.addChild(root);
    tui.start();

    setTimeout(() => {
      tui.stop();
      resolve();
    }, durationMs);
  });
}

// ── Main setup flow ───────────────────────────────────────────────────

export async function runInteractiveSetup(): Promise<void> {
  let step = 1;
  let provider = "";
  let baseUrl = "";
  let nineRouterDashUrl: string | undefined;
  let apiKey = "";
  let defaultModel = "";
  let scope = "";

  while (step >= 1) {
    switch (step) {
      // ── Step 1: Welcome ─────────────────────────────────────────────
      case 1: {
        const v = await showSelectScreen(
          [
            `${C_WHITE}${BOLD}  CodeMap Setup${RESET}`,
            ``,
            `  ${C_GRAY}CodeMap needs an LLM API to power its AI features.${RESET}`,
            `  ${C_GRAY}You can use OpenAI, OpenRouter, a local model, or 9router.${RESET}`,
          ],
          [
            {
              value: "start",
              label: "Start setup",
              description: "configure your LLM API provider",
            },
            {
              value: "exit",
              label: "Exit",
              description: "",
            },
          ],
        );

        if (v === "exit" || v === "__back__") {
          process.exit(0);
        }
        step = 2;
        break;
      }

      // ── Step 2: Provider selection ──────────────────────────────────
      case 2: {
        const v = await showSelectScreen(
          [
            `${C_WHITE}${BOLD}  API Provider${RESET}`,
            ``,
          ],
          [
            {
              value: "9router",
              label: "9router local (recommended)",
              description: "free, runs on your machine",
            },
            {
              value: "openai",
              label: "OpenAI-compatible API",
              description: "use your own API key",
            },
            {
              value: "selfhosted",
              label: "Self-hosted",
              description: "run your own gateway",
            },
          ],
        );

        if (v === "__back__") {
          step = 1;
          break;
        }
        provider = v;
        step = 3;
        break;
      }

      // ── Step 3: Configure provider ──────────────────────────────────
      case 3: {
        if (provider === "openai") {
          const v = await promptForUrl(
            [
              `${C_WHITE}${BOLD}  OpenAI-compatible API${RESET}`,
              ``,
              `  ${C_GRAY}Common base URLs:${RESET}`,
              `  ${C_GRAY}• OpenAI:     https://api.openai.com/v1${RESET}`,
              `  ${C_GRAY}• OpenRouter: https://openrouter.ai/api/v1${RESET}`,
            ],
            "https://api.openai.com/v1",
          );

          if (v === "__back__") {
            step = 2;
            break;
          }
          baseUrl = v;
        } else if (provider === "selfhosted") {
          const v = await promptForUrl(
            [
              `${C_WHITE}${BOLD}  Self-hosted Gateway${RESET}`,
              ``,
              `  ${C_GRAY}Enter the base URL of your gateway${RESET}`,
              `  ${C_GRAY}(e.g. http://localhost:4000/v1)${RESET}`,
            ],
            DEFAULT_BASE_URL,
          );

          if (v === "__back__") {
            step = 2;
            break;
          }
          baseUrl = v;
        } else {
          // 9router local
          const v = await setup9Router();

          if (v === "__back__") {
            step = 2;
            break;
          }
          baseUrl = v;
          nineRouterDashUrl = `http://localhost:${NINE_ROUTER_LOCAL_PORT}/dashboard/endpoint`;
        }
        step = 4;
        break;
      }

      // ── Step 4: API Key ─────────────────────────────────────────────
      case 4: {
        const apiKeyLines = [
          `${C_WHITE}${BOLD}  API Key${RESET}`,
          ``,
        ];
        if (nineRouterDashUrl) {
          apiKeyLines.push(
            `  ${C_GRAY}Get your API key from: ${nineRouterDashUrl}${RESET}`,
            `  ${C_GRAY}Leave empty if your gateway doesn't require auth.${RESET}`,
          );
        } else if (provider === "openai") {
          apiKeyLines.push(`  ${C_GRAY}Enter your API key for the provider.${RESET}`);
        } else {
          apiKeyLines.push(
            `  ${C_GRAY}Leave empty if your gateway doesn't require auth.${RESET}`,
          );
        }

        const v = await showInputScreen(apiKeyLines, "");

        if (v === "__back__") {
          step = 3;
          break;
        }
        apiKey = v;
        step = 5;
        break;
      }

      // ── Step 5: Default Model ───────────────────────────────────────
      case 5: {
        const v = await selectModel(baseUrl, apiKey || undefined);

        if (v === "__back__") {
          step = 4;
          break;
        }
        defaultModel = v;
        step = 6;
        break;
      }

      // ── Step 6: Config Scope ────────────────────────────────────────
      case 6: {
        const v = await showSelectScreen(
          [
            `${C_WHITE}${BOLD}  Config Scope${RESET}`,
            ``,
          ],
          [
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
          ],
        );

        if (v === "__back__") {
          step = 5;
          break;
        }
        scope = v;
        step = 7;
        break;
      }

      // ── Step 7: Write config & Done ─────────────────────────────────
      case 7: {
        // Write config
        const result = await writeGatewayConfig({
          scope: scope as "global" | "project",
          force: true,
          baseUrl,
          apiKey: apiKey || undefined,
          defaultModel,
        });

        // Show done screen
        const maskedKey = apiKey ? `${apiKey.substring(0, 10)}...***` : "(not set)";
        const v = await showSelectScreen(
          [
            `${C_SUCCESS}${BOLD}  Setup complete!${RESET}`,
            ``,
            `  ${C_WHITE}Config saved to: ${result.path}${RESET}`,
            ``,
            `  ${C_GRAY}• Base URL:      ${baseUrl}${RESET}`,
            `  ${C_GRAY}• API Key:       ${maskedKey}${RESET}`,
            `  ${C_GRAY}• Default Model: ${defaultModel}${RESET}`,
            `  ${C_GRAY}• Scope:         ${scope}${RESET}`,
            ``,
            `  ${C_GRAY}Tip: override with env vars:${RESET}`,
            `  ${C_GRAY}  CODEMAP_LLM_GATEWAY_BASE_URL${RESET}`,
            `  ${C_GRAY}  CODEMAP_LLM_GATEWAY_API_KEY${RESET}`,
            `  ${C_GRAY}  CODEMAP_LLM_GATEWAY_CODER_MODEL${RESET}`,
          ],
          [
            {
              value: "done",
              label: "Start chatting",
              description: "launch CodeMap chat",
            },
            {
              value: "exit",
              label: "Exit",
              description: "",
            },
          ],
        );

        if (v === "exit") {
          process.exit(0);
        }
        // "done" or "__back__" — exit the loop
        step = 0;
        break;
      }
    }
  }
}

// ── Sub-flows ─────────────────────────────────────────────────────────

async function promptForUrl(
  lines: string[],
  defaultValue: string,
): Promise<string> {
  let url = await showInputScreen(lines, defaultValue);

  if (url === "__back__") {
    return "__back__";
  }

  while (url) {
    try {
      new URL(url);
      return url;
    } catch {
      const errorLines = [
        ...lines,
        ``,
        `  ${C_ERROR}Invalid URL. Please try again.${RESET}`,
      ];
      url = await showInputScreen(errorLines, defaultValue);
      if (url === "__back__") {
        return "__back__";
      }
    }
  }
  return defaultValue;
}

async function setup9Router(): Promise<string> {
  const statusLines: string[] = [
    `${C_WHITE}${BOLD}  9router Local${RESET}`,
    ``,
  ];

  if (!is9RouterInstalled()) {
    const doInstall = await showSelectScreen(
      [
        ...statusLines,
        `  ${C_GRAY}9router is not installed yet.${RESET}`,
      ],
      [
        {
          value: "install",
          label: "Install 9router",
          description: "npm install -g 9router",
        },
        {
          value: "skip",
          label: "Skip",
          description: "install manually later",
        },
      ],
    );

    if (doInstall === "__back__") {
      return "__back__";
    }

    if (doInstall === "install") {
      // Show installing spinner
      const terminal = new ProcessTerminal();
      terminal.clearScreen();
      const tui = new TUI(terminal, false);
      const root = new Container();
      const status = new Text(
        `  ${C_ACTION}${SPINNER[0]} Installing 9router...${RESET}`,
      );
      root.addChild(status);
      tui.addChild(root);
      tui.start();

      let frame = 0;
      const spinInterval = setInterval(() => {
        frame = (frame + 1) % SPINNER.length;
        status.setText(
          `  ${C_ACTION}${SPINNER[frame]} Installing 9router...${RESET}`,
        );
        tui.requestRender();
      }, 80);

      try {
        await install9Router();
        clearInterval(spinInterval);
        tui.stop();
        await showStatusScreen(
          [
            `  ${C_SUCCESS}✓ 9router installed${RESET}`,
          ],
          800,
        );
      } catch {
        clearInterval(spinInterval);
        tui.stop();
        await showStatusScreen(
          [
            `  ${C_ERROR}✗ Failed to install 9router${RESET}`,
            `  ${C_GRAY}Install manually: npm install -g 9router${RESET}`,
          ],
          2000,
        );
      }
    } else {
      await showStatusScreen(
        [
          `  ${C_YELLOW}Skipping 9router install.${RESET}`,
          `  ${C_GRAY}Install manually: npm install -g 9router${RESET}`,
        ],
        1500,
      );
    }
  }

  // Start 9router if needed
  if (is9RouterInstalled()) {
    if (await is9RouterRunning()) {
      await showStatusScreen(
        [
          `  ${C_SUCCESS}✓ 9router already running at http://localhost:${NINE_ROUTER_LOCAL_PORT}${RESET}`,
        ],
        800,
      );
    } else {
      start9Router();
      await showStatusScreen(
        [
          `  ${C_ACTION}Starting 9router...${RESET}`,
        ],
        2000,
      );

      if (await is9RouterRunning()) {
        await showStatusScreen(
          [
            `  ${C_SUCCESS}✓ 9router started at http://localhost:${NINE_ROUTER_LOCAL_PORT}${RESET}`,
          ],
          800,
        );
      } else {
        await showStatusScreen(
          [
            `  ${C_YELLOW}⚠ 9router may not have started. Check manually.${RESET}`,
          ],
          2000,
        );
      }
    }
  }

  return NINE_ROUTER_LOCAL_BASE_URL;
}

async function selectModel(
  baseUrl: string,
  apiKey?: string,
): Promise<string> {
  // Show fetching spinner
  const terminal = new ProcessTerminal();
  terminal.clearScreen();
  const tui = new TUI(terminal, false);
  const root = new Container();
  const status = new Text(
    `  ${C_WHITE}${BOLD}  Default Model${RESET}\n\n  ${C_ACTION}${SPINNER[0]} Fetching models...${RESET}`,
  );
  root.addChild(status);
  tui.addChild(root);
  tui.start();

  let frame = 0;
  const spinInterval = setInterval(() => {
    frame = (frame + 1) % SPINNER.length;
    status.setText(
      `  ${C_WHITE}${BOLD}  Default Model${RESET}\n\n  ${C_ACTION}${SPINNER[frame]} Fetching models...${RESET}`,
    );
    tui.requestRender();
  }, 80);

  const models = await fetchModels(baseUrl, apiKey);
  clearInterval(spinInterval);
  tui.stop();

  if (models.length > 0) {
    const items: SelectItem[] = models.slice(0, 20).map((m) => ({
      value: m.id,
      label: m.id,
      description: m.owned_by,
    }));

    items.push({
      value: "__custom__",
      label: "Enter custom model ID",
      description: "type your own model name",
    });

    const selected = await showSelectScreen(
      [
        `  ${C_WHITE}${BOLD}  Default Model${RESET}`,
        ``,
        `  ${C_GRAY}Found ${models.length} model(s)${RESET}`,
      ],
      items,
    );

    if (selected === "__back__") {
      return "__back__";
    }

    if (selected === "__custom__") {
      const custom = await showInputScreen(
        [
          `  ${C_WHITE}${BOLD}  Custom Model ID${RESET}`,
          ``,
          `  ${C_GRAY}Enter the model ID to use${RESET}`,
        ],
        "",
      );
      if (custom === "__back__") {
        return "__back__";
      }
      return custom || "coder";
    }

    return selected;
  }

  // No models returned — manual input
  const manual = await showInputScreen(
    [
      `  ${C_WHITE}${BOLD}  Default Model${RESET}`,
      ``,
      `  ${C_GRAY}No models returned by the API.${RESET}`,
      `  ${C_GRAY}You can enter a model ID or profile label:${RESET}`,
      `  ${C_GRAY}  • coder    — code generation tasks${RESET}`,
      `  ${C_GRAY}  • planner  — planning and reasoning${RESET}`,
      `  ${C_GRAY}  • reviewer — code review tasks${RESET}`,
    ],
    "coder",
  );

  if (manual === "__back__") {
    return "__back__";
  }

  return manual || "coder";
}
