import {
  AGENT_PACK_INDEX_URI,
  AGENT_PACK_INSTALL_URI,
  AGENT_PACK_SKILLS,
  AGENT_PACK_TEMPLATES,
  type AgentPackSkillName,
  skillResourceUri,
} from "./agent-pack.js";

export const MCP_FIRST_RULE_URI = "codemap://rules/mcp-first";
export const TASK_LIFECYCLE_RULE_URI = "codemap://rules/task-lifecycle";
export const SKILL_ROUTING_RULE_URI = "codemap://rules/skill-routing";
export const WORKFLOW_GATES_RULE_URI = "codemap://rules/workflow-gates";
export const VERIFICATION_BEFORE_COMPLETION_RULE_URI =
  "codemap://rules/verification-before-completion";

export const TASK_TYPES = [
  "feature",
  "bugfix",
  "debugging",
  "review",
  "refactor",
  "test",
  "research",
] as const;

export type AgentTaskType = (typeof TASK_TYPES)[number];
export type AgentRiskLevel = "low" | "medium" | "high";

export const WORKFLOW_PHASES = [
  "orient",
  "design",
  "plan",
  "implement",
  "verify",
  "finish",
] as const;

export type AgentWorkflowPhase = (typeof WORKFLOW_PHASES)[number];

export interface WorkflowRoute {
  taskType: AgentTaskType;
  description: string;
  requiredSkills: AgentPackSkillName[];
  firstTools: string[];
  hardGates: string[];
  requiredOutputs: string[];
  completionChecks: string[];
  phases: AgentWorkflowPhase[];
}

export const DEFAULT_VERIFICATION_CHECKLIST = [
  "Inspect uncommitted changes with get_working_diff.",
  "Run the smallest relevant build or test command.",
  "Refresh the local MCP index with refresh_local_index after local edits.",
  "Decide whether cloud graph/insights need trigger_reimport and wait_for_import.",
  "Report verification results, skipped checks, and residual risk.",
];

export const WORKFLOW_ROUTES: Record<AgentTaskType, WorkflowRoute> = {
  feature: {
    taskType: "feature",
    description: "New capability, product behavior, route, API, workflow, or vague implementation request.",
    requiredSkills: [
      "brainstorming",
      "writing-plans",
      "executing-plans",
      "verification-before-completion",
    ],
    firstTools: ["recommend_agent_workflow", "explore_task", "summarize_feature_area"],
    hardGates: [
      "Do not edit production files before the design is approved.",
      "After design approval, write an implementation plan before code changes.",
      "Complete verification-before-completion before declaring done.",
    ],
    requiredOutputs: ["Approved design summary", "Implementation plan", "Verification report"],
    completionChecks: DEFAULT_VERIFICATION_CHECKLIST,
    phases: ["orient", "design", "plan", "implement", "verify", "finish"],
  },
  bugfix: {
    taskType: "bugfix",
    description: "Known broken behavior with an expected correct behavior.",
    requiredSkills: [
      "symbol-level-debugging",
      "test-driven-development",
      "safe-edit-and-reimport",
      "verification-before-completion",
    ],
    firstTools: ["recommend_agent_workflow", "explore_task", "search_codebase", "get_symbol_context"],
    hardGates: [
      "Reproduce or identify the failing path before changing code.",
      "Prefer a failing test before production changes when the repo has a matching test pattern.",
      "Complete verification-before-completion before declaring done.",
    ],
    requiredOutputs: ["Failure hypothesis", "Fix summary", "Verification report"],
    completionChecks: DEFAULT_VERIFICATION_CHECKLIST,
    phases: ["orient", "design", "implement", "verify", "finish"],
  },
  debugging: {
    taskType: "debugging",
    description: "Investigation, diagnosis, or explanation of confusing behavior.",
    requiredSkills: [
      "symbol-level-debugging",
      "feature-area-investigation",
      "interpreting-codemap-output",
    ],
    firstTools: ["recommend_agent_workflow", "search_codebase", "get_symbol_context", "find_callers"],
    hardGates: [
      "Do not patch before the likely root cause is grounded in CodeMap context.",
      "Use symbol context and callers/usages before raw broad reads.",
    ],
    requiredOutputs: ["Root-cause explanation", "Impacted files/symbols", "Suggested next action"],
    completionChecks: ["Inspect relevant symbols/callers.", "State confidence and remaining unknowns."],
    phases: ["orient", "design", "finish"],
  },
  review: {
    taskType: "review",
    description: "Code review, PR review, diff review, or risk assessment.",
    requiredSkills: ["token-efficient-code-review", "interpreting-codemap-output"],
    firstTools: ["recommend_agent_workflow", "get_working_diff", "get_diff", "find_usages"],
    hardGates: [
      "Lead with findings by severity.",
      "Use changed symbols and usages before summarizing broad context.",
    ],
    requiredOutputs: ["Findings", "Open questions", "Test gaps"],
    completionChecks: ["Inspect diff.", "Check usages for risky shared changes.", "Mention residual risk."],
    phases: ["orient", "verify", "finish"],
  },
  refactor: {
    taskType: "refactor",
    description: "Behavior-preserving cleanup, symbol move, rename, or structural change.",
    requiredSkills: [
      "feature-area-investigation",
      "safe-edit-and-reimport",
      "verification-before-completion",
    ],
    firstTools: ["recommend_agent_workflow", "find_related_files", "find_usages", "get_working_diff"],
    hardGates: [
      "Confirm behavior-preserving scope before edits.",
      "Use usages/callers before moving or renaming shared symbols.",
      "Complete verification-before-completion before declaring done.",
    ],
    requiredOutputs: ["Refactor scope", "Affected usages", "Verification report"],
    completionChecks: DEFAULT_VERIFICATION_CHECKLIST,
    phases: ["orient", "plan", "implement", "verify", "finish"],
  },
  test: {
    taskType: "test",
    description: "Add, repair, or improve tests.",
    requiredSkills: ["test-driven-development", "verification-before-completion"],
    firstTools: ["recommend_agent_workflow", "search_codebase", "run_tests", "get_symbol_context"],
    hardGates: [
      "Find existing test patterns before adding tests.",
      "For bug coverage, confirm the test fails before the fix when feasible.",
    ],
    requiredOutputs: ["Test target", "Test command", "Verification report"],
    completionChecks: ["Run the targeted test command.", "Inspect diff.", "Refresh local index if files changed."],
    phases: ["orient", "implement", "verify", "finish"],
  },
  research: {
    taskType: "research",
    description: "Read-only exploration, codebase explanation, feasibility analysis, or planning.",
    requiredSkills: ["mcp-first-exploration", "interpreting-codemap-output"],
    firstTools: ["recommend_agent_workflow", "explore_task", "find_related_files", "get_files"],
    hardGates: [
      "Prefer CodeMap summaries, rankings, and next steps before opening raw files.",
      "Do not edit files for read-only research tasks.",
    ],
    requiredOutputs: ["Relevant files/symbols", "Findings", "Recommended next step"],
    completionChecks: ["Cite inspected CodeMap context.", "State confidence and unknowns."],
    phases: ["orient", "finish"],
  },
};

export const ARTIFACT_TEMPLATES = AGENT_PACK_TEMPLATES.map((template) => ({
  id: template.id,
  title: template.title,
  path: template.path,
  resourceUri: template.uri,
}));

export const AGENT_WORKFLOW_SUMMARY = [
  "Use CodeMap MCP tools before raw file reads or grep.",
  "For broad coding tasks, call explore_task first.",
  "For 'which files are related?' or 'what should I read?', call find_related_files.",
  "For known keywords, files, symbols, or exports, call search_codebase.",
  "After you have a shortlist, call get_files for outlines, then get_file for specific content or symbols.",
  "Use find_usages/find_callers for symbol impact analysis.",
  "Use get_working_diff after edits, then build/test as appropriate.",
  "Call refresh_local_index after local edits; call trigger_reimport and wait_for_import only when cloud/web indexing should refresh.",
  "Call recommend_agent_workflow for broad tasks to get required skills, hard gates, artifact templates, and verification checks.",
  "Read required CodeMap Agent Pack skills before implementing gated work.",
];

export const AGENT_WORKFLOW_SEQUENCE = [
  "New session: get_agent_workflow, then check project-context resource. If no local index exists yet, call refresh_local_index first (no auth required).",
  "Broad task: explore_task -> follow suggestedNextTools -> get_file/get_files.",
  "Related-file question: find_related_files(query/file_path/symbol_name) -> get_files -> get_file.",
  "Narrow lookup: search_codebase -> get_file(include=[outline] or [symbols]).",
  "Refactor/cleanup: find_usages or find_callers -> get_file(blast_radius if risky) -> get_working_diff.",
  "Broad work: recommend_agent_workflow -> required skills -> design/plan gates -> implementation.",
  "Verification: inspect diff, build/test, refresh_local_index, and decide whether cloud reimport is needed.",
];

export const SKILL_ROUTING_RULE_MARKDOWN = `# CodeMap Skill Routing

Use \`recommend_agent_workflow\` before broad implementation, debugging, review, refactor, testing, or research tasks.

## Routing Matrix

${Object.values(WORKFLOW_ROUTES)
  .map(
    (route) =>
      `- **${route.taskType}** — ${route.requiredSkills
        .map((skill) => `\`codemap-${skill}\``)
        .join(", ")}. ${route.description}`,
  )
  .join("\n")}

## Mandatory Skill Reads

- New features and vague product work require \`codemap-brainstorming\`.
- Approved designs require \`codemap-writing-plans\`.
- Implementation from a plan requires \`codemap-executing-plans\`, unless the task is a strict TDD task.
- Bug fixes and tests should use \`codemap-test-driven-development\` when a test pattern exists.
- Completion of edited work requires \`codemap-verification-before-completion\`.
`;

export const WORKFLOW_GATES_RULE_MARKDOWN = `# CodeMap Workflow Gates

CodeMap Agent Pack uses Superpowers-style gates to keep agents from jumping into edits too early.

## Gates

1. **Orient** — call \`get_agent_workflow\` if workflow is unknown. The project-context resource is already loaded in your context — do NOT call \`get_project\` or \`list_projects\` unless the user explicitly asks for project or account info. If no local index exists yet, call \`refresh_local_index\` (no auth required). Then run the first tools from \`recommend_agent_workflow\`.
2. **Design** — for features or vague tasks, complete brainstorming and get design approval before editing production files.
3. **Plan** — after design approval, write an implementation plan with exact files, steps, and verification commands.
4. **Implement** — follow the plan or TDD loop; keep changes scoped.
5. **Verify** — inspect diff, run relevant checks, refresh local index, and decide cloud reimport.
6. **Finish** — summarize changed behavior, verification, skipped checks, and residual risk.

Low-risk one-line fixes may use a lightweight design summary instead of a full spec, but they still require verification.
`;

export const VERIFICATION_BEFORE_COMPLETION_RULE_MARKDOWN = `# Verification Before Completion

Never declare edited work complete until the verification checklist is done or a skipped item is explicitly explained.

## Checklist

${DEFAULT_VERIFICATION_CHECKLIST.map((item) => `- ${item}`).join("\n")}

## Completion Summary

Final responses should include changed behavior, verification commands/results, and whether local index refresh or cloud reimport was performed.
`;

export const MCP_FIRST_RULE_MARKDOWN = `# MCP-First Code Exploration

When working in a CodeMap-indexed repository, prefer CodeMap MCP tools before raw file reads or grep.

## Tool Selection

Choose the tool based on the shape of the question:

1. \`get_agent_workflow\` — call at the start of a new CodeMap MCP session to learn the recommended workflow and available rule resources.
2. \`explore_task\` — use first for broad tasks such as "fix bug X", "implement Y", or "investigate Z". It returns likely files, entrypoints, symbols, risks, recommended reads, and suggested next tools.
3. \`find_related_files\` — use when you already have an anchor file/symbol, or when the user asks "which files should I read?", "what is related to X?", or "what is the scope around X?".
4. \`search_codebase\` — use for known keywords, filenames, exports, or symbols. It is faster than broad exploration for narrow lookup.
5. \`get_files\` — fetch outlines for several candidate files in one call. Use after \`explore_task\`, \`find_related_files\`, or \`search_codebase\`.
6. \`get_file\` — read exact content only after you know what you need. Prefer \`include=["outline"]\` for map context and \`include=["symbols"]\` with \`symbol_names\` for function/class bodies.
7. \`find_usages\` / \`find_callers\` — use for symbol impact analysis. Use \`find_callers\` when the symbol's file is known.
8. \`get_project_map\` — inspect folder structure when module layout is unclear.
9. \`get_working_diff\` / \`get_diff\` — inspect uncommitted changes or committed ref diffs.
10. Raw Read / grep — fallback only when MCP cannot answer, such as unindexed files, dynamic string access, or complex regex searches.

## Quick Decisions

- "Fix/investigate/implement" with unclear files -> \`explore_task\`.
- "Which files are related?" -> \`find_related_files\`.
- Known symbol or filename -> \`search_codebase\`.
- Several candidate files -> \`get_files\`.
- Specific symbol body -> \`get_file(include=["symbols"], symbol_names=[...])\`.
- Who calls/imports this? -> \`find_callers\` or \`find_usages\`.
- After edits -> \`get_working_diff\`, build/test, then \`refresh_local_index\` when the local MCP index should refresh.
`;

export const TASK_LIFECYCLE_RULE_MARKDOWN = `# CodeMap Agent Task Lifecycle

## 1. Orient

- Call \`get_agent_workflow\` at the start of a new session if workflow is unknown.
- The project-context resource is already loaded in your context — skip \`get_project\` and \`list_projects\` unless the user explicitly asks for project or account info.
- Use \`explore_task\`, \`find_related_files\`, or \`search_codebase\` according to the task shape.

## 2. Read Deliberately

- Use \`get_files\` to survey multiple outlines.
- Use \`get_file(include=["outline"])\` before full content for large/unknown files.
- Use \`get_file(include=["symbols"], symbol_names=[...])\` for exact function/class bodies.

## 3. Edit Safely

- Keep changes scoped to the task.
- Follow local repo patterns.
- Do not rewrite unrelated files or revert user changes.
- For database changes, prefer schema-first workflows and generated migrations.

## 4. Verify

- Run the smallest sufficient build/test.
- Build shared packages before dependents when applicable.
- Use \`get_working_diff\` to confirm changed files.

## 5. Refresh Index

- Use \`refresh_local_index\` after local edits to refresh the MCP SQLite index without cloud access.
- Use \`trigger_reimport\` then \`wait_for_import\` only when the cloud index, web graph, or insights should refresh.

## 6. Final Response

- Summarize what changed.
- Mention verification results.
- Call out blockers, skipped tests, or unrelated dirty files.
`;

export function buildAgentWorkflowMarkdown() {
  return [
    "# CodeMap MCP Agent Workflow",
    "",
    "Use this guidance before exploring or editing a CodeMap-indexed repository.",
    "",
    "## Summary",
    ...AGENT_WORKFLOW_SUMMARY.map((item) => `- ${item}`),
    "",
    "## Recommended Sequence",
    ...AGENT_WORKFLOW_SEQUENCE.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Rule Resources",
    `- ${MCP_FIRST_RULE_URI}`,
    `- ${TASK_LIFECYCLE_RULE_URI}`,
    `- ${SKILL_ROUTING_RULE_URI}`,
    `- ${WORKFLOW_GATES_RULE_URI}`,
    `- ${VERIFICATION_BEFORE_COMPLETION_RULE_URI}`,
    `- ${AGENT_PACK_INDEX_URI}`,
    `- ${AGENT_PACK_INSTALL_URI}`,
    "",
    "## Agent Pack Skills",
    ...AGENT_PACK_SKILLS.map((skill) => `- ${skillResourceUri(skill)}`),
    "",
    "## Workflow Routing",
    ...Object.values(WORKFLOW_ROUTES).map(
      (route) =>
        `- ${route.taskType}: ${route.requiredSkills
          .map((skill) => skillResourceUri(skill))
          .join(", ")}`,
    ),
    "",
    "## Artifact Templates",
    ...ARTIFACT_TEMPLATES.map((template) => `- ${template.resourceUri} — ${template.title}`),
    "",
    MCP_FIRST_RULE_MARKDOWN,
    "",
    TASK_LIFECYCLE_RULE_MARKDOWN,
    "",
    SKILL_ROUTING_RULE_MARKDOWN,
    "",
    WORKFLOW_GATES_RULE_MARKDOWN,
    "",
    VERIFICATION_BEFORE_COMPLETION_RULE_MARKDOWN,
  ].join("\n");
}

export function isAgentTaskType(value: string | undefined): value is AgentTaskType {
  return TASK_TYPES.some((taskType) => taskType === value);
}

export function inferAgentTaskType(task: string): AgentTaskType {
  const normalized = task.toLowerCase();
  if (/\b(review|pr|diff|audit|findings)\b/.test(normalized)) return "review";
  if (/\b(test|spec|coverage|failing test|unit test|integration test)\b/.test(normalized)) {
    return "test";
  }
  if (/\b(refactor|cleanup|rename|move|restructure)\b/.test(normalized)) return "refactor";
  if (/\b(debug|investigate|root cause|why|trace)\b/.test(normalized)) return "debugging";
  if (/\b(fix|bug|regression|broken|error|fail|failing)\b/.test(normalized)) return "bugfix";
  if (/\b(explain|research|explore|analyze|how does|where is)\b/.test(normalized)) return "research";
  return "feature";
}

export function recommendAgentWorkflow(input: {
  task: string;
  taskType?: string;
  risk?: AgentRiskLevel;
}) {
  const recommendedTaskType = isAgentTaskType(input.taskType)
    ? input.taskType
    : inferAgentTaskType(input.task);
  const route = WORKFLOW_ROUTES[recommendedTaskType];
  const risk = input.risk ?? "medium";
  const hardGates =
    risk === "high"
      ? ["Treat this as high risk: require explicit user approval before edits.", ...route.hardGates]
      : route.hardGates;

  return {
    recommendedTaskType,
    risk,
    phases: route.phases,
    requiredSkills: route.requiredSkills.map((skill) => ({
      name: `codemap-${skill}`,
      resourceUri: skillResourceUri(skill),
    })),
    hardGates,
    nextTools: route.firstTools,
    requiredOutputs: route.requiredOutputs,
    artifactTemplates: ARTIFACT_TEMPLATES,
    verificationChecklist: route.completionChecks,
    resourceUris: [
      MCP_FIRST_RULE_URI,
      TASK_LIFECYCLE_RULE_URI,
      SKILL_ROUTING_RULE_URI,
      WORKFLOW_GATES_RULE_URI,
      VERIFICATION_BEFORE_COMPLETION_RULE_URI,
      ...route.requiredSkills.map((skill) => skillResourceUri(skill)),
      ...ARTIFACT_TEMPLATES.map((template) => template.resourceUri),
    ],
  };
}

export function buildWorkflowRecommendationMarkdown(
  recommendation: ReturnType<typeof recommendAgentWorkflow>,
) {
  return [
    `# Recommended CodeMap Workflow: ${recommendation.recommendedTaskType}`,
    "",
    `Risk: ${recommendation.risk}`,
    "",
    "## Required Skills",
    ...recommendation.requiredSkills.map(
      (skill) => `- ${skill.name} — ${skill.resourceUri}`,
    ),
    "",
    "## Hard Gates",
    ...recommendation.hardGates.map((gate) => `- ${gate}`),
    "",
    "## Next Tools",
    ...recommendation.nextTools.map((tool) => `- ${tool}`),
    "",
    "## Required Outputs",
    ...recommendation.requiredOutputs.map((output) => `- ${output}`),
    "",
    "## Verification",
    ...recommendation.verificationChecklist.map((check) => `- ${check}`),
  ].join("\n");
}
