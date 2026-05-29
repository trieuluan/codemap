const FALLBACK_GATEWAY_MODEL =
  process.env.CODEMAP_LLM_GATEWAY_DEFAULT_MODEL ?? "cx/gpt-5.3-codex";

/**
 * Resolve the model ID to pass to the gateway.
 *
 * Resolution order:
 * 1. If `modelId` is in the available list → use it as-is.
 * 2. If `available` is non-empty but `modelId` is not in it → use the first
 *    available model (covers unknown/stale IDs).
 * 3. If `available` is empty or undefined AND `modelId` is a non-empty concrete
 *    ID → honour the caller's intent and return `modelId` directly.
 * 4. Last resort → return the configured FALLBACK_GATEWAY_MODEL.
 *
 * Note: profile labels ('planner', 'coder', 'reviewer') are no longer valid
 * inputs; callers are responsible for resolving profiles to concrete model IDs
 * before calling this function.
 */
export function resolveGatewayModel(modelId: string, available: string[] | undefined): string {
  if (available && available.length > 0) {
    if (available.includes(modelId)) return modelId;
    return available[0]!;
  }
  // No available list — trust the caller's concrete modelId if provided.
  if (modelId && modelId.trim().length > 0) return modelId;
  return FALLBACK_GATEWAY_MODEL;
}

export function resolveHarnessModelId(modelId: string, available: string[] | undefined): string {
  const resolved = resolveGatewayModel(modelId, available);
  return resolved.startsWith("9router/") ? resolved : `9router/${resolved}`;
}

export function stripNineRouterPrefix(modelId: string): string {
  return modelId.startsWith("9router/") ? modelId.slice("9router/".length) : modelId;
}
