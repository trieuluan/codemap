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
- phase "multi": ONLY for large features spanning multiple modules, major architectural refactors, or when user explicitly says "make a plan" / "plan first". Requires genuine multi-step planning before coding.
- phase "single": everything else — including simple file edits, bug fixes, test changes, adding a function, renaming things, one-file changes, quick fixes, explaining code, Q&A. Default to "single" unless the task is clearly large/complex.
- tier "reviewer": analyze code, explain how X works, investigate, review, debug, audit, read and understand files — NO code changes, needs deep code reading
- tier "coder": implement, fix, optimize, refactor — code changes expected
- tier "planner": quick factual questions, general knowledge, non-code questions — no file reading needed

Examples:
- "fix the bug in auth.ts" → single, coder
- "add a unit test for parseDate" → single, coder
- "rename variable X to Y in file Z" → single, coder
- "sửa file X" / "edit X" / "update X" → single, coder
- "explain how this function works" → single, reviewer
- "implement full OAuth2 system across auth/web/api modules" → multi, coder
- "refactor the entire database layer" → multi, coder
- "make a plan for adding notifications" → multi, planner

Respond with ONLY the JSON.`;

const FALLBACK: TaskClassification = {
  phase: "single",
  tier: "coder",
  taskType: "general",
  reason: "classification failed",
};

// Short confirmation replies mean the user is approving a previously shown plan
// or edit preview — always continue as coder without calling the LLM.
const CONFIRMATION_SYNONYMS = new Set([
  "ok", "okay", "yes", "y", "go", "proceed", "sure", "do it", "implement",
  "ừ", "ừm", "đồng ý", "được", "làm đi", "làm luôn", "tiếp tục", "ok luôn",
  "okie", "yep", "yup", "oke",
]);

const CONFIRMATION_RESULT: TaskClassification = {
  phase: "single",
  tier: "coder",
  taskType: "general",
  reason: "confirmation — continuing coding task",
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

    if (CONFIRMATION_SYNONYMS.has(message.trim().toLowerCase())) {
      return CONFIRMATION_RESULT;
    }

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
