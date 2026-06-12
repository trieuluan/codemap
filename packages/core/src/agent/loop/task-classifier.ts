import type { NineRouterProvider } from "./provider.js";

export interface TaskClassification {
  phase: "single" | "multi";
  taskType: "feature" | "bugfix" | "debugging" | "review" | "refactor" | "research" | "general";
  effort: "low" | "medium" | "high";
  reason: string;
  executionMode: "single" | "plan_only" | "multi_execute";
}

const CLASSIFIER_SYSTEM = `You are a task router for a coding assistant. Analyze the user message and respond with ONLY a JSON object.

Output format:
{"phase":"single"|"multi","taskType":"feature"|"bugfix"|"debugging"|"review"|"refactor"|"research"|"general","effort":"low"|"medium"|"high","reason":"<one line>","executionMode":"single"|"plan_only"|"multi_execute"}

Rules:
- phase "multi": ONLY for large features spanning multiple modules, major architectural refactors. Requires genuine multi-step planning before coding.
- phase "single": everything else — including simple file edits, bug fixes, test changes, adding a function, renaming things, one-file changes, quick fixes, explaining code, Q&A, and ALL lookup/search/find/explain tasks. Default to "single" unless the task is clearly large/complex.
- CRITICAL: phase "multi" is NEVER correct for lookup, search, find, explain, or read-only tasks. If the task does not produce code changes, it is always "single".
- effort "high": complex multi-file debugging, architectural decisions, security/auth/payment changes, multi-phase tasks, user says "carefully"/"thoroughly"/"deep dive", investigating intermittent/hard-to-reproduce issues
- effort "medium": standard coding tasks — add a feature, fix a bug, write tests, refactor a module
- effort "low": rename, one-liner fix, explaining code, lookup/search tasks, Q&A

executionMode is determined by user intent:
- "single": This is the default. Used when the task is small or read-only.
- "plan_only": User explicitly asks to "make a plan", "plan first", or requests planning/design without immediate execution. Does not require tool calls — text-only output is expected.
- "multi_execute": Large multi-phase task that requires both planning AND execution with tool calls. The user wants the full multi-step workflow to complete the work.

Examples:
- "fix the bug in auth.ts" → single, bugfix, medium, single
- "add a unit test for parseDate" → single, feature, low, single
- "implement pagination for the project list" → single, feature, medium, single
- "rename variable X to Y in file Z" → single, refactor, low, single
- "sửa 1 dòng trong file X" / "delete line X" → single, bugfix, low, single
- "debug tại sao auth redirect bị lỗi" → single, debugging, high, single
- "fix the race condition in the payment flow" → single, bugfix, high, single
- "investigate why the import worker crashes intermittently" → single, debugging, high, single
- "explain how this function works" → single, review, low, single
- "tìm đoạn code render X" / "find where X is rendered" → single, review, low, single
- "how does X work" / "chỗ nào xử lý X" → single, research, low, single
- "implement full OAuth2 system across auth/web/api modules" → multi, feature, high, multi_execute
- "refactor the entire database layer" → multi, refactor, high, multi_execute
- "make a plan for adding notifications" → multi, feature, high, plan_only
- "make a plan for implementing user authentication" → multi, feature, high, plan_only
- "planning first, then execute later" → multi, feature, high, plan_only

Respond with ONLY the JSON.`;

const FALLBACK: TaskClassification = {
  phase: "single",
  taskType: "general",
  effort: "medium",
  reason: "classification failed",
  executionMode: "single",
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
  taskType: "general",
  effort: "medium",
  reason: "confirmation — continuing coding task",
  executionMode: "single",
};

export async function classifyTask(
  message: string,
  provider: NineRouterProvider,
  model: string,
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
      model,
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
  if (!isTaskType(parsed.taskType)) return FALLBACK;

  // "multi" only makes sense when implementing across modules.
  // research/review taskTypes are always read-only — never multi-phase.
  const readOnlyTaskType = parsed.taskType === "research" || parsed.taskType === "review";
  const phase = parsed.phase === "multi" && readOnlyTaskType ? "single" : parsed.phase;

  return {
    phase,
    taskType: parsed.taskType,
    effort: isEffort(parsed.effort) ? parsed.effort : "low",
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
    executionMode: parsed.executionMode && isExecutionMode(parsed.executionMode) ? parsed.executionMode : "single",
  };
}

function isPhase(value: unknown): value is TaskClassification["phase"] {
  return value === "single" || value === "multi";
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

function isExecutionMode(value: unknown): value is TaskClassification["executionMode"] {
  return value === "single" || value === "plan_only" || value === "multi_execute";
}
