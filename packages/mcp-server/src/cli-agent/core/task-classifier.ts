import type { NineRouterProvider } from "./provider.js";

export interface TaskClassification {
  phase: "single" | "multi";
  tier: "planner" | "coder" | "reviewer";
  taskType: "feature" | "bugfix" | "debugging" | "review" | "refactor" | "research" | "general";
  effort: "low" | "medium" | "high";
  reason: string;
}

const CLASSIFIER_SYSTEM = `You are a task router for a coding assistant. Analyze the user message and respond with ONLY a JSON object.

Output format:
{"phase":"single"|"multi","tier":"planner"|"coder"|"reviewer","taskType":"feature"|"bugfix"|"debugging"|"review"|"refactor"|"research"|"general","effort":"low"|"medium"|"high","reason":"<one line>"}

Rules:
- phase "multi": ONLY for large features spanning multiple modules, major architectural refactors, or when user explicitly says "make a plan" / "plan first". Requires genuine multi-step planning before coding.
- phase "single": everything else — including simple file edits, bug fixes, test changes, adding a function, renaming things, one-file changes, quick fixes, explaining code, Q&A, and ALL lookup/search/find/explain tasks. Default to "single" unless the task is clearly large/complex.
- CRITICAL: phase "multi" is NEVER correct for lookup, search, find, explain, or read-only tasks. If the task does not produce code changes, it is always "single".
- tier "reviewer": find/search code, explain how X works, investigate where X is, read and understand files, audit, review diff — NO code changes, needs deep code reading
- tier "coder": implement, fix, optimize, refactor — code changes expected
- tier "planner": quick factual questions, general knowledge, non-code questions — no file reading needed
- effort "high": complex multi-file debugging, architectural decisions, security/auth/payment changes, multi-phase tasks, user says "carefully"/"thoroughly"/"deep dive", investigating intermittent/hard-to-reproduce issues
- effort "medium": standard coder tasks — add a feature, fix a bug, write tests, refactor a module (DEFAULT for coder tier)
- effort "low": rename, one-liner fix, explaining code, lookup/search tasks, Q&A, all planner-tier tasks, all reviewer-tier tasks

Examples:
- "fix the bug in auth.ts" → single, coder, medium
- "add a unit test for parseDate" → single, coder, medium
- "implement pagination for the project list" → single, coder, medium
- "rename variable X to Y in file Z" → single, coder, low
- "sửa 1 dòng trong file X" / "delete line X" → single, coder, low
- "debug tại sao auth redirect bị lỗi" → single, coder, high
- "fix the race condition in the payment flow" → single, coder, high
- "investigate why the import worker crashes intermittently" → single, reviewer, high
- "explain how this function works" → single, reviewer, low
- "tìm đoạn code render X" / "find where X is rendered" → single, reviewer, low
- "how does X work" / "chỗ nào xử lý X" → single, reviewer, low
- "implement full OAuth2 system across auth/web/api modules" → multi, coder, high
- "refactor the entire database layer" → multi, coder, high
- "make a plan for adding notifications" → multi, planner, high

Respond with ONLY the JSON.`;

const FALLBACK: TaskClassification = {
  phase: "single",
  tier: "coder",
  taskType: "general",
  effort: "medium",
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
  effort: "medium",
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

  // "multi" only makes sense when the coder needs to implement across modules.
  // research/review taskTypes are always read-only — never multi-phase.
  const readOnlyTaskType = parsed.taskType === "research" || parsed.taskType === "review";
  const phase =
    parsed.phase === "multi" && (parsed.tier !== "coder" || readOnlyTaskType)
      ? "single"
      : parsed.phase;

  return {
    phase,
    tier: parsed.tier,
    taskType: parsed.taskType,
    effort: isEffort(parsed.effort) ? parsed.effort : "low",
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

function isEffort(value: unknown): value is TaskClassification["effort"] {
  return value === "low" || value === "medium" || value === "high";
}
