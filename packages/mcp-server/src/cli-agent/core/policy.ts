import type {
  GatewayConfig,
  ModelProfile,
  RiskLevel,
  RouteRecommendation,
  RouteRequest,
  TaskType,
} from "../types.js";

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
  const preferredTier = chooseTier(taskType, risk);
  const profile = findProfile(config.profiles, preferredTier) ?? config.profiles[0];
  if (!profile) {
    throw new Error("No model profiles configured for LLM Gateway.");
  }

  const fallbackProfile = chooseFallbackProfile(config.profiles, profile);
  return {
    taskType,
    risk,
    profile,
    fallbackProfile,
    reasons: buildReasons(taskType, risk, profile),
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
): ModelProfile["tier"] {
  if (taskType === "review" || taskType === "debugging") return "reviewer";
  if (taskType === "refactor") return risk === "high" ? "coder" : "reviewer";
  if (taskType === "feature" || taskType === "bugfix") return risk === "low" ? "planner" : "coder";
  if (taskType === "research" || taskType === "test" || taskType === "general") return "planner";
  return risk === "high" ? "coder" : "planner";
}

function chooseFallbackProfile(
  profiles: ModelProfile[],
  selected: ModelProfile,
): ModelProfile | undefined {
  return profiles.find((profile) => profile.id !== selected.id && profile.tier === "planner") ??
    profiles.find((profile) => profile.id !== selected.id);
}

function buildReasons(
  taskType: TaskType,
  risk: RiskLevel,
  profile: ModelProfile,
): string[] {
  const reasons = [`classified as ${taskType}`, `risk is ${risk}`];
  if (profile.tier === "coder") reasons.push("selected coder profile for implementation work");
  if (profile.tier === "reviewer") reasons.push("selected reviewer profile for review/debug work");
  if (profile.tier === "planner") reasons.push("selected planner profile for fast low-risk work");
  if (profile.tier === "local") reasons.push("selected local profile for privacy/offline preference");
  return reasons;
}
