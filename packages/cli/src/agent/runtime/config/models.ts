import type { GatewayProviderId } from "../../types.js";
import { GATEWAY_PROVIDER_IDS } from "../../types.js";

const FALLBACK_GATEWAY_MODEL =
  process.env.CODEMAP_LLM_GATEWAY_DEFAULT_MODEL ?? "cx/gpt-5.3-codex";

/**
 * Resolve the model ID to pass to the gateway.
 *
 * Resolution order:
 * 1. If `modelId` matches a combo ID → pass through (gateway handles routing).
 * 2. If `modelId` is in the available models list → use it as-is.
 * 3. If `availableModels` is non-empty but `modelId` is not in it → use the first
 *    available model. A warning is emitted so silent regressions are observable.
 * 4. If `availableModels` is empty/undefined and `modelId` is non-empty → trust the
 *    caller's concrete ID directly.
 * 5. Last resort → return the configured FALLBACK_GATEWAY_MODEL with a warning.
 */
export function resolveGatewayModel(
  modelId: string,
  availableModels: string[] | undefined,
  availableCombos?: string[],
): string {
  // Combo IDs pass through directly — the gateway handles combo routing.
  if (availableCombos?.includes(modelId)) return modelId;

  if (availableModels && availableModels.length > 0) {
    if (availableModels.includes(modelId)) return modelId;
    const fallback = availableModels[0]!;
    console.warn(
      `[resolveGatewayModel] Model "${modelId}" not found in available list; ` +
        `using "${fallback}" instead. Available: ${availableModels.join(", ")}`,
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
  availableModels: string[] | undefined,
  availableCombos?: string[],
  provider: GatewayProviderId = "9router",
): string {
  const resolved = resolveGatewayModel(modelId, availableModels, availableCombos);
  const prefix = provider === "openai" ? "openai" : provider;
  return resolved.startsWith(`${prefix}/`) ? resolved : `${prefix}/${resolved}`;
}

export function stripProviderPrefix(id: string, provider: GatewayProviderId = "9router"): string {
  const prefix = `${provider}/`;
  if (id.startsWith(prefix)) return id.slice(prefix.length);
  for (const p of GATEWAY_PROVIDER_IDS) {
    if (id.startsWith(`${p}/`)) return id.slice(p.length + 1);
  }
  return id;
}
