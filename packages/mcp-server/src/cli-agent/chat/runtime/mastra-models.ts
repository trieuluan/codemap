const FALLBACK_GATEWAY_MODELS: Record<string, string> = {
  planner: process.env.CODEMAP_LLM_GATEWAY_PLANNER_MODEL ??
    process.env.CODEMAP_LLM_GATEWAY_DEFAULT_MODEL ??
    "cx/gpt-5.3-codex",
  coder: process.env.CODEMAP_LLM_GATEWAY_CODER_MODEL ??
    process.env.CODEMAP_LLM_GATEWAY_DEFAULT_MODEL ??
    "cx/gpt-5.3-codex",
  reviewer: process.env.CODEMAP_LLM_GATEWAY_REVIEWER_MODEL ??
    process.env.CODEMAP_LLM_GATEWAY_DEFAULT_MODEL ??
    "cx/gpt-5.3-codex-review",
};

/**
 * Resolve the model ID to pass to Mastra's switchModel.
 * "coder", "planner", etc. are profile labels; if not in the gateway model list,
 * fall back to the first available real model. If no available models, use as-is.
 */
export function resolveGatewayModel(modelId: string, available: string[] | undefined): string {
  const fallback = FALLBACK_GATEWAY_MODELS[modelId];
  if (!available || available.length === 0) return fallback ?? modelId;
  if (available.includes(modelId)) return modelId;

  const byPrefix = (...prefixes: string[]) =>
    available.find((model) => prefixes.some((prefix) => model.startsWith(prefix)));
  const byIncludes = (...needles: string[]) =>
    available.find((model) => needles.every((needle) => model.includes(needle)));

  if (modelId === "planner") {
    return byIncludes("-codex") ?? byPrefix("kr/auto", "cx/", "cc/", "mimo/") ?? available[0]!;
  }
  if (modelId === "coder") {
    return byIncludes("-codex") ?? byIncludes("agentic") ?? byPrefix("kr/auto", "cx/", "cc/", "mimo/") ?? available[0]!;
  }
  if (modelId === "reviewer") {
    return byIncludes("review") ?? byIncludes("-codex") ?? byPrefix("cx/", "cc/", "kr/auto", "mimo/") ?? available[0]!;
  }

  return available[0]!;
}

export function resolveHarnessModelId(modelId: string, available: string[] | undefined): string {
  const resolved = resolveGatewayModel(modelId, available);
  return resolved.startsWith("9router/") ? resolved : `9router/${resolved}`;
}

export function stripNineRouterPrefix(modelId: string): string {
  return modelId.startsWith("9router/") ? modelId.slice("9router/".length) : modelId;
}
