# CLAUDE.md

Use CodeMap MCP-first workflow for this repository.

For broad implementation/debug/review/refactor/test/research tasks, use CodeMap MCP tools to gather repo context before editing. Start with `explore_task` when files are unclear, or inspect exact files/symbols directly when the user already named them.

Must read:

- `.claude/rules/codemap-mcp-first.md`
- `.claude/rules/codemap-task-lifecycle.md`

Relevant skills live under `.claude/skills/codemap-*`:
- `codemap-brainstorming` — design-first workflow with hard gate before implementation
- `codemap-writing-plans` — decision-complete plan after approved design
- `codemap-executing-plans` — execute approved plans in scoped steps
- `codemap-test-driven-development` — RED → GREEN → REFACTOR using CodeMap tools
- `codemap-verification-before-completion` — final diff/build/index/reimport gate
- `codemap-systematic-debugging` — Use when debugging: 4-phase root cause process with Iron Law
- `codemap-receiving-code-review` — Use when receiving code review feedback on a PR or diff
- `codemap-requesting-code-review` — Use when you want to dispatch a code reviewer subagent
- `codemap-finishing-a-development-branch` — Use when ready to merge or close a development branch
- `codemap-subagent-driven-development` — Use when orchestrating parallel subagents for complex tasks

When a CodeMap MCP tool returns ranked files, symbol context, or next steps, read the summary and ranking signals before opening raw files.

