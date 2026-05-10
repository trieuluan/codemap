import type { GatewayMode } from "../types.js";
import { isLocalModel, isStrongModel } from "./profiles.js";

export interface ModeCheckResult {
  allowed: boolean;
  reason?: string;
  requireConfirm?: boolean;
}

/**
 * Check if a model is allowed under the current mode policy.
 */
export function checkModelPolicy(
  model: string,
  mode: GatewayMode,
): ModeCheckResult {
  const local = isLocalModel(model);

  switch (mode) {
    case "local-only":
      if (!local) {
        return {
          allowed: false,
          reason: `Mode is local-only. "${model}" is a cloud model.`,
        };
      }
      return { allowed: true };

    case "ask-before-cloud":
      if (!local) {
        return {
          allowed: true,
          requireConfirm: true,
          reason: `"${model}" is a cloud model. Confirm to proceed.`,
        };
      }
      return { allowed: true };

    case "cloud-ok":
      return { allowed: true };

    case "hybrid":
      return { allowed: true };

    default:
      return { allowed: true };
  }
}

/**
 * Filter a model list based on mode policy.
 */
export function filterModelsByMode(
  models: string[],
  mode: GatewayMode,
): { models: string[]; filtered: string[] } {
  if (mode === "local-only") {
    const local = models.filter((m) => isLocalModel(m));
    const filtered = models.filter((m) => !isLocalModel(m));
    return { models: local, filtered };
  }
  return { models, filtered: [] };
}

/**
 * Get display info for the current mode.
 */
export function getModeDisplay(mode: string): {
  label: string;
  color: "red" | "yellow" | "green" | "cyan";
  description: string;
} {
  switch (mode) {
    case "local-only":
      return {
        label: "LOCAL",
        color: "red",
        description: "Only local models allowed. Cloud requests are blocked.",
      };
    case "ask-before-cloud":
      return {
        label: "ASK",
        color: "yellow",
        description: "Cloud models require confirmation before use.",
      };
    case "cloud-ok":
      return {
        label: "CLOUD",
        color: "green",
        description: "All models allowed without restrictions.",
      };
    case "hybrid":
      return {
        label: "HYBRID",
        color: "cyan",
        description: "Auto-selects local for lightweight tasks, cloud for heavy tasks.",
      };
    default:
      return {
        label: mode.toUpperCase(),
        color: "cyan",
        description: "",
      };
  }
}

/**
 * Get a warning message when switching mode while current model may conflict.
 */
export function selectModelForMode(
  models: string[],
  mode: GatewayMode,
  excludeModel?: string,
): string | null {
  const { models: allowed } = filterModelsByMode(models, mode);
  // Prefer non-excluded models
  const candidates = excludeModel
    ? allowed.filter((m) => m !== excludeModel)
    : allowed;
  if (candidates.length === 0) return null;
  // Prefer strong models first, then fast
  const strong = candidates.filter((m) => isStrongModel(m));
  if (strong.length > 0) return strong[0];
  return candidates[0];
}

export function getRecommendedMode(
  currentModel: string,
  failedModel: string,
): GatewayMode[] {
  const failedLocal = isLocalModel(failedModel);
  if (failedLocal) return ["cloud-ok", "hybrid"];
  return ["hybrid", "cloud-ok", "ask-before-cloud"];
}

export function getModeSwitchWarning(
  currentModel: string,
  newMode: GatewayMode,
): string | null {
  const local = isLocalModel(currentModel);

  if (newMode === "local-only" && !local) {
    return `Warning: current model "${currentModel}" is a cloud model. It will be rejected under local-only mode. Switch model first with /model.`;
  }

  return null;
}
