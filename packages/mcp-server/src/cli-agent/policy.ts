import type {
  GatewayConfig,
  GatewayMode,
  ModelProfile,
  RiskLevel,
  RouteRecommendation,
  RouteRequest,
  TaskType,
} from "./types.js";

const TASK_PATTERNS: Array<[TaskType, RegExp]> = [
  ["review", /\b(review|pr|diff|audit|security)\b/i],
  ["debugging", /\b(debug|diagnose|investigate|trace|root cause|why)\b/i],
  ["bugfix", /\b(fix|bug|broken|failing|error|exception|crash|regression)\b/i],
  ["refactor", /\b(refactor|rename|move|cleanup|restructure)\b/i],
  ["test", /\b(test|spec|coverage|tdd)\b/i],
  ["research", /\b(research|explain|explore|compare|summarize)\b/i],
  ["feature", /\b(implement|add|build|create|feature|support)\b/i],
];

export function recommendRoute(
  request: RouteRequest,
  config: GatewayConfig,
): RouteRecommendation {
  const taskType = classifyTask(request.task);
  const risk = classifyRisk(request.task, taskType);
  const mode = request.mode ?? config.mode;
  const preferredTier = chooseTier(taskType, risk, mode);
  const profile = findProfile(config.profiles, preferredTier) ?? config.profiles[0];
  if (!profile) {
    throw new Error("No model profiles configured for LLM Gateway.");
  }

  const fallbackProfile = chooseFallbackProfile(config.profiles, profile, mode);
  return {
    taskType,
    risk,
    mode,
    profile,
    fallbackProfile,
    reasons: buildReasons(taskType, risk, mode, profile),
  };
}

export function findProfile(
  profiles: ModelProfile[],
  tierOrId: ModelProfile["tier"] | string,
): ModelProfile | undefined {
  return profiles.find((profile) => profile.id === tierOrId) ??
    profiles.find((profile) => profile.tier === tierOrId);
}

function classifyTask(task: string): TaskType {
  for (const [taskType, pattern] of TASK_PATTERNS) {
    if (pattern.test(task)) return taskType;
  }
  return "general";
}

function classifyRisk(task: string, taskType: TaskType): RiskLevel {
  if (/\b(auth|billing|payment|migration|database|security|prod|production)\b/i.test(task)) {
    return "high";
  }
  if (taskType === "feature" || taskType === "refactor" || taskType === "debugging") {
    return "medium";
  }
  return "low";
}

function chooseTier(
  taskType: TaskType,
  risk: RiskLevel,
  mode: GatewayMode,
): ModelProfile["tier"] {
  if (mode === "local-only") return "local";
  if (risk === "high") return "strong";
  if (taskType === "review" || taskType === "debugging" || taskType === "refactor") {
    return "strong";
  }
  if (taskType === "research" || taskType === "test" || taskType === "general") {
    return "fast";
  }
  return risk === "medium" ? "strong" : "fast";
}

function chooseFallbackProfile(
  profiles: ModelProfile[],
  selected: ModelProfile,
  mode: GatewayMode,
): ModelProfile | undefined {
  if (mode === "local-only") return undefined;
  return profiles.find((profile) => profile.id !== selected.id && profile.tier === "fast") ??
    profiles.find((profile) => profile.id !== selected.id);
}

function buildReasons(
  taskType: TaskType,
  risk: RiskLevel,
  mode: GatewayMode,
  profile: ModelProfile,
): string[] {
  const reasons = [`classified as ${taskType}`, `risk is ${risk}`];
  if (mode === "local-only") reasons.push("local-only mode requires local profile");
  if (profile.tier === "strong") reasons.push("selected strong profile for reasoning-heavy work");
  if (profile.tier === "fast") reasons.push("selected fast profile for low-latency work");
  if (profile.tier === "local") reasons.push("selected local profile for privacy/offline preference");
  return reasons;
}
