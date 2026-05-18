import type { NineRouterProvider } from "../../provider.js";

export interface TaskClassification {
  phase: "single" | "multi";
  tier: "planner" | "coder" | "reviewer";
  taskType: "feature" | "bugfix" | "debugging" | "review" | "refactor" | "research" | "general";
  reason: string;
}

const CLASSIFIER_SYSTEM = `You are a task router for a coding assistant. Analyze the user message and respond with ONLY a JSON object.

Output format:
{"phase":"single"|"multi","tier":"planner"|"coder"|"reviewer","taskType":"feature"|"bugfix"|"debugging"|"review"|"refactor"|"research"|"general","reason":"<one line>"}

Rules:
- phase "multi": complex features, large refactors, optimizations, tasks that require planning AND code changes. Use "multi" when the task ultimately requires modifying source files.
- phase "single": pure Q&A, explain code, quick one-liner fixes, or when user explicitly wants only a plan/doc with no code changes
- tier "reviewer": analyze code, explain how X works, investigate, review, debug, audit, read and understand files — NO code changes, needs deep code reading
- tier "coder": implement, fix, optimize, refactor — code changes expected
- tier "planner": quick factual questions, general knowledge, non-code questions — no file reading needed

IMPORTANT: "lên plan", "make a plan", "plan for X" where X involves code changes → phase "multi", tier "coder". Creating a markdown plan file alone is NOT a valid deliverable for coding tasks — actual source file changes are required.
Respond with ONLY the JSON.`;

const FALLBACK: TaskClassification = {
  phase: "single",
  tier: "coder",
  taskType: "general",
  reason: "classification failed",
};

export async function classifyTask(
  message: string,
  provider: NineRouterProvider,
  plannerModel: string,
  signal?: AbortSignal,
): Promise<TaskClassification> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    if (signal?.aborted) return FALLBACK;

    let raw = "";
    for await (const chunk of provider.stream({
      model: plannerModel,
      system: CLASSIFIER_SYSTEM,
      messages: [{ role: "user", content: message }],
      maxTokens: 120,
      signal: controller.signal,
    })) {
      if (chunk.text) raw += chunk.text;
    }

    return parseClassification(raw);
  } catch {
    return FALLBACK;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

function parseClassification(raw: string): TaskClassification {
  const json = raw
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const parsed = JSON.parse(json) as Partial<TaskClassification>;

  if (!isPhase(parsed.phase)) return FALLBACK;
  if (!isTier(parsed.tier)) return FALLBACK;
  if (!isTaskType(parsed.taskType)) return FALLBACK;

  return {
    phase: parsed.phase,
    tier: parsed.tier,
    taskType: parsed.taskType,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
  };
}

function isPhase(value: unknown): value is TaskClassification["phase"] {
  return value === "single" || value === "multi";
}

function isTier(value: unknown): value is TaskClassification["tier"] {
  return value === "planner" || value === "coder" || value === "reviewer";
}

function isTaskType(value: unknown): value is TaskClassification["taskType"] {
  return (
    value === "feature" ||
    value === "bugfix" ||
    value === "debugging" ||
    value === "review" ||
    value === "refactor" ||
    value === "research" ||
    value === "general"
  );
}
