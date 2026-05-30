import * as p from "@clack/prompts";
import { writeGatewayConfig, DEFAULT_BASE_URL } from "../config.js";
import {
  NINE_ROUTER_LOCAL_PORT,
  NINE_ROUTER_LOCAL_BASE_URL,
  fetchModels,
  is9RouterInstalled,
  install9Router,
  is9RouterRunning,
  start9Router,
} from "./9router-helpers.js";

// ── Sub-flows ─────────────────────────────────────────────────────────

async function setup9Router(): Promise<string | symbol> {
  if (!is9RouterInstalled()) {
    const doInstall = await p.select({
      message: "9router is not installed yet. Would you like to install it?",
      options: [
        { value: "install", label: "Install 9router", hint: "npm install -g 9router" },
        { value: "skip", label: "Skip", hint: "I'll install it myself" },
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
  baseUrl: string,
  apiKey?: string,
): Promise<string | symbol> {
  const s = p.spinner();
  s.start("Fetching models");
  const models = await fetchModels(baseUrl, apiKey);
  s.stop(`Found ${models.length} model(s)`);

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
      message: "Select default model",
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
      });
      if (p.isCancel(custom)) return custom;
      return custom || "coder";
    }

    return selected;
  }

  // No models returned — manual input
  const manual = await p.text({
    message: "Enter default model ID",
    placeholder: "e.g. gpt-4o, claude-sonnet-4",
    defaultValue: "coder",
  });

  if (p.isCancel(manual)) return manual;
  return manual || "coder";
}

// ── Main setup wizard ─────────────────────────────────────────────────

export async function runInteractiveSetup(): Promise<void> {
  p.intro("CodeMap — AI-powered code intelligence");

  let step = 1;
  let provider = "";
  let baseUrl = "";
  let apiKey = "";
  let defaultModel = "";
  let scope = "";

  while (step >= 1) {
    switch (step) {
      // ── Step 1: Provider ──────────────────────────────────────────
      case 1: {
        const v = await p.select({
          message: "Choose your LLM provider",
          options: [
            { value: "9router", label: "9router (recommended)", hint: "local proxy, no API key needed" },
            { value: "openai", label: "OpenAI", hint: "platform.openai.com" },
            { value: "selfhosted", label: "Self-hosted / Other", hint: "any OpenAI-compatible API" },
          ],
        });

        if (p.isCancel(v)) {
          p.cancel("Setup cancelled.");
          return;
        }
        provider = v;
        step = 2;
        break;
      }

      // ── Step 2: Provider config ───────────────────────────────────
      case 2: {
        if (provider === "9router") {
          const url = await setup9Router();
          if (p.isCancel(url)) { step = 1; break; }
          baseUrl = url;
        } else {
          const defaultUrl = provider === "openai"
            ? "https://api.openai.com/v1"
            : DEFAULT_BASE_URL;

          const v = await p.text({
            message: `Base URL for ${provider}`,
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
          ? `Get your key from: http://localhost:${NINE_ROUTER_LOCAL_PORT}/dashboard/endpoint`
          : "Enter your API key for the provider";

        const v = await p.password({
          message: hint,
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

      // ── Step 4: Default Model ────────────────────────────────────
      case 4: {
        const v = await selectModel(baseUrl, apiKey || undefined);
        if (p.isCancel(v)) { step = 3; break; }
        defaultModel = v;
        step = 5;
        break;
      }

      // ── Step 5: Config Scope ─────────────────────────────────────
      case 5: {
        const v = await p.select({
          message: "Where to save your configuration?",
          options: [
            { value: "global", label: "Global", hint: "~/.codemap/llm-gateway.json (all projects)" },
            { value: "project", label: "Project", hint: ".codemap/llm-gateway.json (current project only)" },
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
            `Provider:  ${provider}`,
            `Base URL:  ${baseUrl}`,
            `API Key:   ${maskedKey}`,
            `Model:     ${defaultModel}`,
            `Scope:     ${scope}`,
          ].join("\n"),
          "Configuration summary",
        );

        const v = await p.confirm({
          message: "Save this configuration?",
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
          baseUrl,
          apiKey: apiKey || undefined,
          defaultModel,
        });

        s.stop("Configuration saved");

        p.note(result.path, "Config saved to");
        p.note(
          [
            "CODEMAP_LLM_GATEWAY_BASE_URL",
            "CODEMAP_LLM_GATEWAY_API_KEY",
            "CODEMAP_LLM_GATEWAY_CODER_MODEL",
          ].join("\n"),
          "Override with env vars",
        );

        p.outro("Setup complete! Run codemap to start.");
        return;
      }
    }
  }
}
