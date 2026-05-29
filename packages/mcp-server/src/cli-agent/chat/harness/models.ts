const FALLBACK_GATEWAY_MODEL =
  process.env.CODEMAP_LLM_GATEWAY_DEFAULT_MODEL ?? "cx/gpt-5.3-codex";

const KNOWN_PROFILE_LABELS = new Set(["planner", "coder", "reviewer"]);

/**
 * Resolve the model ID to pass to the gateway.
 *
 * Resolution order:
 * 1. If `modelId` is in the available list → use it as-is.
 * 2. If `available` is non-empty but `modelId` is not in it → use the first
 *    available model. A warning is emitted so silent regressions are observable.
 * 3. If `available` is empty/undefined and `modelId` is non-empty → trust the
 *    caller's concrete ID directly.
 * 4. Last resort → return the configured FALLBACK_GATEWAY_MODEL with a warning.
 *
 * Callers must resolve profile labels ('planner', 'coder', 'reviewer') to a
 * concrete model ID before calling this function. Passing a profile label emits
 * a warning so the violation is observable in logs.
 */
export function resolveGatewayModel(modelId: string, available: string[] | undefined): string {
  if (KNOWN_PROFILE_LABELS.has(modelId)) {
    console.warn(
      `[resolveGatewayModel] Received profile label "${modelId}" — callers must resolve ` +
        `profiles to a concrete model ID before calling this function. Falling through to available list.`,
    );
  }

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

export function resolveHarnessModelId(modelId: string, available: string[] | undefined): string {
  const resolved = resolveGatewayModel(modelId, available);
  return resolved.startsWith("9router/") ? resolved : `9router/${resolved}`;
}

export function stripNineRouterPrefix(modelId: string): string {
  return modelId.startsWith("9router/") ? modelId.slice("9router/".length) : modelId;
}
