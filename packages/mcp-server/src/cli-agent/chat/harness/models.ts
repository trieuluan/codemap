const FALLBACK_GATEWAY_MODEL =
  process.env.CODEMAP_LLM_GATEWAY_DEFAULT_MODEL ?? "cx/gpt-5.3-codex";

/**
 * Resolve the model ID to pass to the gateway.
 *
 * Resolution order:
 * 1. If `modelId` matches a combo ID → pass through (gateway handles routing).
 * 2. If `modelId` is in the available models list → use it as-is.
 * 3. If `available` is non-empty but `modelId` is not in it → use the first
 *    available model. A warning is emitted so silent regressions are observable.
 * 4. If `available` is empty/undefined and `modelId` is non-empty → trust the
 *    caller's concrete ID directly.
 * 5. Last resort → return the configured FALLBACK_GATEWAY_MODEL with a warning.
 */
export function resolveGatewayModel(
  modelId: string,
  available: string[] | undefined,
  availableCombos?: string[],
): string {
  // Combo IDs pass through directly — the gateway handles combo routing.
  if (availableCombos?.includes(modelId)) return modelId;

  if (available && available.length > 0) {
    if (available.includes(modelId)) return modelId;
    const fallback = available[0]!;
    console.warn(
      `[resolveGatewayModel] Model "${modelId}" not found in available list; ` +
        `using "${fallback}" instead. Available: ${available.join(", ")}`,
    );
    return fallback;
  }

  // No available list — trust the caller's concrete modelId if provided.
  if (modelId.length > 0) return modelId;

  console.warn(
    `[resolveGatewayModel] No modelId and no available models; ` +
      `falling back to FALLBACK_GATEWAY_MODEL="${FALLBACK_GATEWAY_MODEL}". ` +
      `Set CODEMAP_LLM_GATEWAY_DEFAULT_MODEL to override.`,
  );
  return FALLBACK_GATEWAY_MODEL;
}

export function resolveHarnessModelId(
  modelId: string,
  available: string[] | undefined,
  availableCombos?: string[],
): string {
  const resolved = resolveGatewayModel(modelId, available, availableCombos);
  return resolved.startsWith("9router/") ? resolved : `9router/${resolved}`;
}

export function stripNineRouterPrefix(id: string): string {
  return id.startsWith("9router/") ? id.slice("9router/".length) : id;
}
