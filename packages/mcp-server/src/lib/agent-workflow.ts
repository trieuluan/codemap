import {
  AGENT_PACK_INDEX_URI,
  AGENT_PACK_INSTALL_URI,
  AGENT_PACK_SKILLS,
  skillResourceUri,
} from "./agent-pack.js";

export const MCP_FIRST_RULE_URI = "codemap://rules/mcp-first";
export const TASK_LIFECYCLE_RULE_URI = "codemap://rules/task-lifecycle";

export const AGENT_WORKFLOW_SUMMARY = [
  "Use CodeMap MCP tools before raw file reads or grep.",
  "For broad coding tasks, call explore_task first.",
  "For 'which files are related?' or 'what should I read?', call find_related_files.",
  "For known keywords, files, symbols, or exports, call search_codebase.",
  "After you have a shortlist, call get_files for outlines, then get_file for specific content or symbols.",
  "Use find_usages/find_callers for symbol impact analysis.",
  "Use get_working_diff after edits, then build/test as appropriate.",
  "Call refresh_local_index after local edits; call trigger_reimport and wait_for_import only when cloud/web indexing should refresh.",
  "Read CodeMap Agent Pack skills when the agent needs a reusable workflow.",
];

export const AGENT_WORKFLOW_SEQUENCE = [
  "New session: get_agent_workflow, then get_project or project-context resource.",
  "Broad task: explore_task -> follow suggestedNextTools -> get_file/get_files.",
  "Related-file question: find_related_files(query/file_path/symbol_name) -> get_files -> get_file.",
  "Narrow lookup: search_codebase -> get_file(include=[outline] or [symbols]).",
  "Refactor/cleanup: find_usages or find_callers -> get_file(blast_radius if risky) -> get_working_diff.",
  "Verification: build shared before api/web; run tests when behavior risk warrants it.",
];

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
- Call \`get_project\` or read \`codemap://project/context\` to confirm linked project and index health.
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
    `- ${AGENT_PACK_INDEX_URI}`,
    `- ${AGENT_PACK_INSTALL_URI}`,
    "",
    "## Agent Pack Skills",
    ...AGENT_PACK_SKILLS.map((skill) => `- ${skillResourceUri(skill)}`),
    "",
    MCP_FIRST_RULE_MARKDOWN,
    "",
    TASK_LIFECYCLE_RULE_MARKDOWN,
  ].join("\n");
}
