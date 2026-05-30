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
import cfonts from "cfonts";
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

// ── Banner ────────────────────────────────────────────────────────────

function buildBannerLines(): string[] {
  try {
    const result = cfonts.render("CODEMAP", {
      font: "simple3d",
      gradient: ["cyan", "magenta"],
      transitionColors: true,
      env: "node",
    });
    const raw: string = (result as { string: string }).string ?? "";
    const lines = raw.split("\n");
    let s = 0, e = lines.length - 1;
    while (s <= e && (lines[s] ?? "").replace(/\x1b\[[0-9;]*m/g, "").trim() === "") s++;
    while (e >= s && (lines[e] ?? "").replace(/\x1b\[[0-9;]*m/g, "").trim() === "") e--;
    return lines.slice(s, e + 1);
  } catch {
    return ["  CODEMAP"];
  }
}

// ── Progress indicator ────────────────────────────────────────────────

function buildProgressLine(currentStep: number, totalSteps: number): string {
  const width = 30;
  const filled = Math.round((currentStep / totalSteps) * width);
  const empty = width - filled;
  const bar = "━".repeat(filled) + "─".repeat(empty);
  return `${C_GRAY}  Step ${currentStep}/${totalSteps}  ${bar}${RESET}`;
}

// ── Keyboard hints ────────────────────────────────────────────────────

function buildKeyboardHints(hasDefault: boolean = false): string {
  const hints = ["↑↓ Navigate", "Enter Select", "Esc Back", "Ctrl+C Exit"];
  if (hasDefault) hints.splice(1, 0, "Tab Fill default");
  return `\n${C_GRAY}  ${hints.join("  │  ")}${RESET}`;
}

function formatCell(value: string, width: number): string {
  const visible = value.length > width ? `${value.slice(0, Math.max(0, width - 1))}…` : value;
  return visible.padEnd(width);
}

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
  options?: { currentStep?: number; totalSteps?: number; showBanner?: boolean },
): Promise<string> {
  return new Promise((resolve) => {
    const terminal = new ProcessTerminal();
    terminal.clearScreen();
    const tui = new TUI(terminal, false);
    const root = new Container();

    // Banner
    if (options?.showBanner) {
      const bannerLines = buildBannerLines();
      for (const line of bannerLines) {
        root.addChild(new Text(line));
      }
      root.addChild(new Text(`${C_GRAY}  AI-POWERED CODE INTELLIGENCE & AGENT PLATFORM${RESET}`));
      root.addChild(new Spacer(1));
    }

    // Progress indicator
    if (options?.currentStep && options?.totalSteps) {
      root.addChild(new Text(buildProgressLine(options.currentStep, options.totalSteps)));
      root.addChild(new Spacer(1));
    }

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
    root.addChild(new Text(buildKeyboardHints()));
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
  options?: { currentStep?: number; totalSteps?: number; showBanner?: boolean },
): Promise<string> {
  return new Promise((resolve) => {
    const terminal = new ProcessTerminal();
    terminal.clearScreen();
    const tui = new TUI(terminal, false);
    const root = new Container();

    // Banner
    if (options?.showBanner) {
      const bannerLines = buildBannerLines();
      for (const line of bannerLines) {
        root.addChild(new Text(line));
      }
      root.addChild(new Text(`${C_GRAY}  AI-POWERED CODE INTELLIGENCE & AGENT PLATFORM${RESET}`));
      root.addChild(new Spacer(1));
    }

    // Progress indicator
    if (options?.currentStep && options?.totalSteps) {
      root.addChild(new Text(buildProgressLine(options.currentStep, options.totalSteps)));
      root.addChild(new Spacer(1));
    }

    for (const line of lines) {
      root.addChild(new Text(line));
    }
    root.addChild(new Spacer(1));

    // Show hint line if defaultValue provided
    if (defaultValue) {
      root.addChild(new Text(`${C_GRAY}  Press Enter for default: ${defaultValue}${RESET}`));
      root.addChild(new Spacer(1));
    }

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

    root.addChild(input);
    root.addChild(new Text(buildKeyboardHints(!!defaultValue)));
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

function showStatusScreen(
  lines: string[],
  durationMs = 1500,
  options?: { currentStep?: number; totalSteps?: number; showBanner?: boolean },
): Promise<void> {
  return new Promise((resolve) => {
    const terminal = new ProcessTerminal();
    const tui = new TUI(terminal, false);
    const root = new Container();

    // Banner
    if (options?.showBanner) {
      const bannerLines = buildBannerLines();
      for (const line of bannerLines) {
        root.addChild(new Text(line));
      }
      root.addChild(new Text(`${C_GRAY}  AI-POWERED CODE INTELLIGENCE & AGENT PLATFORM${RESET}`));
      root.addChild(new Spacer(1));
    }

    // Progress indicator
    if (options?.currentStep && options?.totalSteps) {
      root.addChild(new Text(buildProgressLine(options.currentStep, options.totalSteps)));
      root.addChild(new Spacer(1));
    }

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
            `${C_WHITE}${BOLD}  Welcome to CodeMap Setup${RESET}`,
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
          { currentStep: 1, totalSteps: 8, showBanner: true },
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
            `  ${C_GRAY}Choose your LLM API provider:${RESET}`,
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
          { currentStep: 2, totalSteps: 8 },
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
            { currentStep: 3, totalSteps: 8 },
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
            { currentStep: 3, totalSteps: 8 },
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

        const v = await showInputScreen(apiKeyLines, "", { currentStep: 4, totalSteps: 8 });

        if (v === "__back__") {
          step = 3;
          break;
        }
        apiKey = v;
        if (apiKey) {
          const looksValid = apiKey.length >= 8;
          await showStatusScreen(
            [
              looksValid
                ? `  ${C_SUCCESS}✓ API key captured${RESET}`
                : `  ${C_YELLOW}⚠ API key looks short; continuing anyway${RESET}`,
              `  ${C_GRAY}Stored value will be masked in the summary.${RESET}`,
            ],
            900,
            { currentStep: 4, totalSteps: 8 },
          );
        }
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
            `  ${C_GRAY}Where to save your configuration:${RESET}`,
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
          { currentStep: 6, totalSteps: 8 },
        );

        if (v === "__back__") {
          step = 5;
          break;
        }
        scope = v;
        step = 7;
        break;
      }

      // ── Step 7: Summary ────────────────────────────────────────────
      case 7: {
        const maskedKey = apiKey ? `${apiKey.substring(0, 10)}...***` : "(not set)";
        const v = await showSelectScreen(
          [
            `${C_WHITE}${BOLD}  Configuration Summary${RESET}`,
            ``,
            `  ${C_GRAY}Please review your configuration:${RESET}`,
            ``,
            `  ${C_WHITE}╭────────────────────────────────────────────╮${RESET}`,
            `  ${C_WHITE}│                                            │${RESET}`,
            `  ${C_WHITE}│  Provider:     ${C_ACTION}${formatCell(provider, 25)}${C_WHITE}│${RESET}`,
            `  ${C_WHITE}│  Base URL:     ${C_ACTION}${formatCell(baseUrl, 25)}${C_WHITE}│${RESET}`,
            `  ${C_WHITE}│  API Key:      ${C_ACTION}${formatCell(maskedKey, 25)}${C_WHITE}│${RESET}`,
            `  ${C_WHITE}│  Model:        ${C_ACTION}${formatCell(defaultModel, 25)}${C_WHITE}│${RESET}`,
            `  ${C_WHITE}│  Scope:        ${C_ACTION}${formatCell(scope, 25)}${C_WHITE}│${RESET}`,
            `  ${C_WHITE}│                                            │${RESET}`,
            `  ${C_WHITE}╰────────────────────────────────────────────╯${RESET}`,
          ],
          [
            {
              value: "confirm",
              label: "Save configuration",
              description: "write config to disk",
            },
            {
              value: "back",
              label: "Go back",
              description: "change settings",
            },
          ],
          { currentStep: 7, totalSteps: 8 },
        );

        if (v === "back" || v === "__back__") {
          step = 6;
          break;
        }
        step = 8;
        break;
      }

      // ── Step 8: Write config & Done ─────────────────────────────────
      case 8: {
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
            `${C_SUCCESS}${BOLD}  ✓ Setup complete!${RESET}`,
            ``,
            `  ${C_WHITE}Config saved to: ${result.path}${RESET}`,
            ``,
            `  ${C_GRAY}╭────────────────────────────────────────────╮${RESET}`,
            `  ${C_GRAY}│                                            │${RESET}`,
            `  ${C_GRAY}│  Base URL:      ${C_WHITE}${formatCell(baseUrl, 24)}${C_GRAY}│${RESET}`,
            `  ${C_GRAY}│  API Key:       ${C_WHITE}${formatCell(maskedKey, 24)}${C_GRAY}│${RESET}`,
            `  ${C_GRAY}│  Default Model: ${C_WHITE}${formatCell(defaultModel, 24)}${C_GRAY}│${RESET}`,
            `  ${C_GRAY}│  Scope:         ${C_WHITE}${formatCell(scope, 24)}${C_GRAY}│${RESET}`,
            `  ${C_GRAY}│                                            │${RESET}`,
            `  ${C_GRAY}╰────────────────────────────────────────────╯${RESET}`,
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
          { currentStep: 8, totalSteps: 8 },
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
  options?: { currentStep?: number; totalSteps?: number },
): Promise<string> {
  let url = await showInputScreen(lines, defaultValue, options);

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
      url = await showInputScreen(errorLines, defaultValue, options);
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
      { currentStep: 3, totalSteps: 8 },
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
      root.addChild(new Text(buildProgressLine(3, 8)));
      root.addChild(new Spacer(1));
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
          { currentStep: 3, totalSteps: 8 },
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
          { currentStep: 3, totalSteps: 8 },
        );
      }
    } else {
      await showStatusScreen(
        [
          `  ${C_YELLOW}Skipping 9router install.${RESET}`,
          `  ${C_GRAY}Install manually: npm install -g 9router${RESET}`,
        ],
        1500,
        { currentStep: 3, totalSteps: 8 },
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
        { currentStep: 3, totalSteps: 8 },
      );
    } else {
      start9Router();
      await showStatusScreen(
        [
          `  ${C_ACTION}Starting 9router...${RESET}`,
        ],
        2000,
        { currentStep: 3, totalSteps: 8 },
      );

      if (await is9RouterRunning()) {
        await showStatusScreen(
          [
            `  ${C_SUCCESS}✓ 9router started at http://localhost:${NINE_ROUTER_LOCAL_PORT}${RESET}`,
          ],
          800,
          { currentStep: 3, totalSteps: 8 },
        );
      } else {
        await showStatusScreen(
          [
            `  ${C_YELLOW}⚠ 9router may not have started. Check manually.${RESET}`,
          ],
          2000,
          { currentStep: 3, totalSteps: 8 },
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

  // Progress indicator
  root.addChild(new Text(buildProgressLine(5, 8)));
  root.addChild(new Spacer(1));

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
      { currentStep: 5, totalSteps: 8 },
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
        { currentStep: 5, totalSteps: 8 },
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
    { currentStep: 5, totalSteps: 8 },
  );

  if (manual === "__back__") {
    return "__back__";
  }

  return manual || "coder";
}
