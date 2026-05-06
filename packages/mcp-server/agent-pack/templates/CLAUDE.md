# CLAUDE.md

Use CodeMap MCP-first workflow for this repository.

For broad implementation/debug/review/refactor/test/research tasks, call `recommend_agent_workflow` before editing. Follow returned required skills, hard gates, artifact templates, and verification checklist.

Must read:

- `.claude/rules/codemap-mcp-first.md`
- `.claude/rules/codemap-task-lifecycle.md`

Relevant skills live under `.claude/skills/codemap-*`:
- `codemap-brainstorming` — design-first workflow with hard gate before implementation
- `codemap-writing-plans` — decision-complete plan after approved design
- `codemap-executing-plans` — execute approved plans in scoped steps
- `codemap-test-driven-development` — RED → GREEN → REFACTOR using CodeMap tools
- `codemap-verification-before-completion` — final diff/build/index/reimport gate

When a CodeMap MCP tool returns ranked files, symbol context, or next steps, read the summary and ranking signals before opening raw files.
