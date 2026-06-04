import * as p from "@clack/prompts";
import { writeGatewayConfig, DEFAULT_BASE_URL } from "../../cli/config.js";
import type { GatewayModeDefaults, GatewayProviderId } from "../types.js";
import {
  NINE_ROUTER_LOCAL_PORT,
  NINE_ROUTER_LOCAL_BASE_URL,
  fetchModels,
  is9RouterInstalled,
  install9Router,
  is9RouterRunning,
  start9Router,
} from "./9router-helpers.js";
import { PROVIDER_REGISTRY, getProviderMeta } from "./provider-registry.js";

const RESET = "\x1b[0m";
const C_ACTION = "\x1b[38;2;96;216;255m";
const C_SUCCESS = "\x1b[38;2;34;197;94m";
const C_MUTED = "\x1b[38;2;107;114;128m";
const C_WHITE = "\x1b[38;2;229;231;235m";
const STEP_TOTAL = 6;

function gradientText(text: string): string {
  const colors = [
    "\x1b[38;2;96;216;255m",
    "\x1b[38;2;125;211;252m",
    "\x1b[38;2;147;197;253m",
    "\x1b[38;2;196;181;253m",
    "\x1b[38;2;216;180;254m",
    "\x1b[38;2;244;114;182m",
  ];

  return Array.from(text)
    .map((char, index) => `${colors[index % colors.length]}${char}`)
    .join("") + RESET;
}

function buildBrandHeader(): string {
  return [
    `  ${gradientText("CODEMAP")}`,
    `  ${C_MUTED}I N I T I A L   S E T U P  ·  G A T E W A Y${RESET}`,
  ].join("\n");
}

function setupProgress(step: number): string {
  const dots = Array.from({ length: STEP_TOTAL }, (_, i) => {
    const n = i + 1;
    if (n < step) return `${C_SUCCESS}●${RESET}`;
    if (n === step) return `${C_ACTION}◆${RESET}`;
    return `${C_MUTED}○${RESET}`;
  }).join("  ");

  return `${dots}  ${C_MUTED}step ${step} of ${STEP_TOTAL}${RESET}`;
}

function setupMessage(step: number, message: string): string {
  return `${C_WHITE}CodeMap — AI-powered code intelligence${RESET}\n\n${setupProgress(step)}\n\n${message}`;
}

// ── Sub-flows ─────────────────────────────────────────────────────────

async function setup9Router(): Promise<string | symbol> {
  if (!is9RouterInstalled()) {
    const doInstall = await p.select({
      message: setupMessage(2, "9router is not installed yet. Install the local gateway now?"),
      options: [
        { value: "install", label: "Install 9router", hint: "recommended · npm install -g 9router" },
        { value: "skip", label: "Skip for now", hint: "I'll install it myself" },
      ],
    });

    if (p.isCancel(doInstall)) return doInstall;

    if (doInstall === "install") {
      const s = p.spinner();
      s.start("Installing 9router");
      try {
        await install9Router();
        s.stop("9router installed");
      } catch {
        s.stop("Failed to install 9router");
        p.log.warn("Install manually: npm install -g 9router");
      }
    } else {
      p.log.warn("Skipping 9router install. Run: npm install -g 9router");
    }
  }

  if (is9RouterInstalled()) {
    if (await is9RouterRunning()) {
      p.log.success(`9router already running at http://localhost:${NINE_ROUTER_LOCAL_PORT}`);
    } else {
      start9Router();
      const s = p.spinner();
      s.start("Starting 9router");
      await new Promise((r) => setTimeout(r, 2000));
      s.stop("9router started");

      if (!(await is9RouterRunning())) {
        p.log.warn("9router may not have started. Check manually.");
      }
    }
  }

  return NINE_ROUTER_LOCAL_BASE_URL;
}

async function selectModel(
  models: Awaited<ReturnType<typeof fetchModels>>,
  stepLabel = "Select model",
): Promise<string | symbol> {
  if (models.length > 0) {
    const options = [
      ...models.map((m) => ({
        value: m.id,
        label: m.id,
        hint: m.owned_by,
      })),
      { value: "__custom__", label: "Enter custom model ID", hint: "type your own" },
    ];

    const selected = await p.autocomplete({
      message: stepLabel,
      options,
      placeholder: "Type to search models...",
      maxItems: 10,
      filter: (search, option) => {
        const query = search.toLowerCase();
        return [String(option.value), option.label ?? "", option.hint ?? ""]
          .some((value) => value.toLowerCase().includes(query));
      },
    });

    if (p.isCancel(selected)) return selected;

    if (selected === "__custom__") {
      const custom = await p.text({
        message: "Enter custom model ID",
        placeholder: "e.g. gpt-4o, claude-sonnet-4",
        validate: (value) => value.trim() ? undefined : "Model ID is required",
      });
      if (p.isCancel(custom)) return custom;
      return custom;
    }

    return selected;
  }

  const manual = await p.text({
    message: `${stepLabel}\nEnter model ID`,
    placeholder: "e.g. gpt-4o, claude-sonnet-4",
    validate: (value) => value.trim() ? undefined : "Model ID is required",
  });

  if (p.isCancel(manual)) return manual;
  return manual;
}

async function fetchAvailableModels(baseUrl: string, apiKey?: string): Promise<Awaited<ReturnType<typeof fetchModels>>> {
  const s = p.spinner();
  s.start("Fetching models");
  const models = await fetchModels(baseUrl, apiKey);
  s.stop(`Found ${models.length} model(s)`);
  return models;
}

// ── Main setup wizard ─────────────────────────────────────────────────

export async function runInteractiveSetup(): Promise<void> {
  p.intro(buildBrandHeader());

  let step = 1;
  let provider: GatewayProviderId = "9router";
  let baseUrl = "";
  let apiKey = "";
  let defaultModel = "";
  let modeDefaults: GatewayModeDefaults = {};
  let scope = "";

  while (step >= 1) {
    switch (step) {
      // ── Step 1: Provider ──────────────────────────────────────────
      case 1: {
        const v = await p.select({
          message: setupMessage(1, "Choose your LLM provider"),
          options: PROVIDER_REGISTRY.map((meta) => ({
            value: meta.id,
            label: meta.label,
            hint: meta.hint,
          })),
        });

        if (p.isCancel(v)) {
          p.cancel("Setup cancelled.");
          return;
        }
        provider = v as GatewayProviderId;
        const meta = getProviderMeta(provider);
        baseUrl = meta?.defaultBaseUrl ?? DEFAULT_BASE_URL;
        step = 2;
        break;
      }

      // ── Step 2: Provider config ───────────────────────────────────
      case 2: {
        const meta = getProviderMeta(provider);
        if (meta?.needsLocalSetup) {
          const url = await setup9Router();
          if (p.isCancel(url)) { step = 1; break; }
          baseUrl = url;
        } else {
          const defaultUrl = meta?.defaultBaseUrl ?? DEFAULT_BASE_URL;

          const v = await p.text({
            message: setupMessage(2, "Enter the gateway base URL"),
            defaultValue: defaultUrl,
            placeholder: defaultUrl,
          });

          if (p.isCancel(v)) { step = 1; break; }
          baseUrl = v || defaultUrl;
        }
        step = 3;
        break;
      }

      // ── Step 3: API Key ──────────────────────────────────────────
      case 3: {
        const hint = provider === "9router"
          ? `Paste the endpoint key from http://localhost:${NINE_ROUTER_LOCAL_PORT}/dashboard/endpoint`
          : "Enter the API key for this gateway";

        const v = await p.password({
          message: setupMessage(3, hint),
          mask: "•",
        });

        if (p.isCancel(v)) { step = 2; break; }
        apiKey = v;

        if (apiKey && apiKey.length < 8) {
          p.log.warn("API key looks short; continuing anyway.");
        }
        step = 4;
        break;
      }

      // ── Step 4: Mode Models ─────────────────────────────────────
      case 4: {
        const models = await fetchAvailableModels(baseUrl, apiKey || undefined);

        const buildModel = await selectModel(models, setupMessage(4, "Select model for build mode"));
        if (p.isCancel(buildModel)) { step = 3; break; }

        const planModel = await selectModel(models, setupMessage(4, "Select model for plan mode"));
        if (p.isCancel(planModel)) { step = 3; break; }

        const fastModel = await selectModel(models, setupMessage(4, "Select model for fast mode"));
        if (p.isCancel(fastModel)) { step = 3; break; }

        modeDefaults = {
          build: buildModel,
          plan: planModel,
          fast: fastModel,
        };
        defaultModel = buildModel;
        step = 5;
        break;
      }

      // ── Step 5: Config Scope ─────────────────────────────────────
      case 5: {
        const v = await p.select({
          message: setupMessage(5, "Where should CodeMap save this configuration?"),
          options: [
            { value: "global", label: "Global", hint: "~/.codemap/settings.json · all projects" },
            { value: "project", label: "Project", hint: ".codemap/settings.json · current repo only" },
          ],
        });

        if (p.isCancel(v)) { step = 4; break; }
        scope = v;
        step = 6;
        break;
      }

      // ── Step 6: Summary + Confirm ────────────────────────────────
      case 6: {
        const maskedKey = apiKey ? `${apiKey.substring(0, 10)}•••` : "(not set)";

        p.note(
          [
            setupProgress(6),
            "",
            `Gateway:   ${provider}`,
            `Base URL:  ${baseUrl}`,
            `API key:   ${maskedKey}`,
            `Model:     ${defaultModel}`,
            `Modes:     build=${modeDefaults.build}, plan=${modeDefaults.plan}, fast=${modeDefaults.fast}`,
            `Saved to:  ${scope}`,
          ].join("\n"),
          "Review configuration",
        );

        const v = await p.confirm({
          message: setupMessage(6, "Save this configuration?"),
        });

        if (p.isCancel(v)) { step = 5; break; }
        if (!v) { step = 5; break; }
        step = 7;
        break;
      }

      // ── Step 7: Write config + Done ──────────────────────────────
      case 7: {
        const s = p.spinner();
        s.start("Saving configuration");

        const result = await writeGatewayConfig({
          scope: scope as "global" | "project",
          force: true,
          provider,
          baseUrl,
          apiKey: apiKey || undefined,
          defaultModel,
          modeDefaults,
        });

        s.stop("Configuration saved");

        p.note(result.path, "Config saved");
        p.note(
          [
            "CODEMAP_LLM_GATEWAY_PROVIDER",
            "CODEMAP_LLM_GATEWAY_BASE_URL",
            "CODEMAP_LLM_GATEWAY_API_KEY",
            "CODEMAP_LLM_GATEWAY_CODER_MODEL",
            "CODEMAP_LLM_GATEWAY_BUILD_MODEL",
            "CODEMAP_LLM_GATEWAY_PLAN_MODEL",
            "CODEMAP_LLM_GATEWAY_FAST_MODEL",
          ].join("\n"),
          "Environment overrides",
        );

        p.outro("Setup complete. Run codemap to start mapping your repo.");
        return;
      }
    }
  }
}
