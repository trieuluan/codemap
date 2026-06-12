import type { GatewayProviderId } from "@codemap-ai/core/agent";

export interface ProviderMeta {
  id: GatewayProviderId;
  label: string;
  hint: string;
  defaultBaseUrl: string;
  needsApiKey: boolean;
  /** Provider needs local process management (install/start). */
  needsLocalSetup: boolean;
  /** Display group in the setup wizard. */
  group: "recommended" | "cloud" | "local";
}

export const PROVIDER_REGISTRY: ProviderMeta[] = [
  // ── Recommended ────────────────────────────────────────────────────
  {
    id: "9router",
    label: "9router (recommended)",
    hint: "local proxy, no API key needed",
    defaultBaseUrl: "http://localhost:20128/v1",
    needsApiKey: false,
    needsLocalSetup: true,
    group: "recommended",
  },

  // ── Cloud providers ────────────────────────────────────────────────
  {
    id: "openai",
    label: "OpenAI",
    hint: "platform.openai.com · GPT-4o, o3",
    defaultBaseUrl: "https://api.openai.com/v1",
    needsApiKey: true,
    needsLocalSetup: false,
    group: "cloud",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    hint: "console.anthropic.com · Claude",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    needsApiKey: true,
    needsLocalSetup: false,
    group: "cloud",
  },
  {
    id: "google",
    label: "Google Gemini",
    hint: "aistudio.google.com · Gemini 2.5",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    needsApiKey: true,
    needsLocalSetup: false,
    group: "cloud",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    hint: "platform.deepseek.com · cheap & capable",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    needsApiKey: true,
    needsLocalSetup: false,
    group: "cloud",
  },
  {
    id: "groq",
    label: "Groq",
    hint: "console.groq.com · fast inference",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    needsApiKey: true,
    needsLocalSetup: false,
    group: "cloud",
  },
  {
    id: "mistral",
    label: "Mistral",
    hint: "console.mistral.ai · European provider",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    needsApiKey: true,
    needsLocalSetup: false,
    group: "cloud",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    hint: "openrouter.ai · multi-provider aggregator",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    needsApiKey: true,
    needsLocalSetup: false,
    group: "cloud",
  },
  {
    id: "azure",
    label: "Azure OpenAI",
    hint: "portal.azure.com · enterprise OpenAI",
    defaultBaseUrl: "", // user enters their endpoint
    needsApiKey: true,
    needsLocalSetup: false,
    group: "cloud",
  },

  // ── Local providers ────────────────────────────────────────────────
  {
    id: "ollama",
    label: "Ollama",
    hint: "ollama.com · local models, no API key",
    defaultBaseUrl: "http://localhost:11434/v1",
    needsApiKey: false,
    needsLocalSetup: false,
    group: "local",
  },
  {
    id: "self-hosted",
    label: "Self-hosted / Other",
    hint: "any OpenAI-compatible API",
    defaultBaseUrl: "http://localhost:8080/v1",
    needsApiKey: true,
    needsLocalSetup: false,
    group: "local",
  },
];

const PROVIDER_MAP = new Map(PROVIDER_REGISTRY.map((p) => [p.id, p]));

export function getProviderMeta(id: GatewayProviderId): ProviderMeta | undefined {
  return PROVIDER_MAP.get(id);
}

export function getProviderIds(): GatewayProviderId[] {
  return PROVIDER_REGISTRY.map((p) => p.id);
}
