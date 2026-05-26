# AGENTS.md

Use CodeMap MCP before raw file reads or grep.

- Start with `get_agent_workflow` and `get_project`.
- Broad implementation/debug/review/refactor/test/research tasks with unclear files: `explore_task`.
- Follow relevant skills, hard gates, artifact templates, and verification checklist.
- Feature areas: `summarize_feature_area`.
- Related files: `find_related_files`.
- Known symbols/files: `search_codebase`.
- Several candidates: `get_files`.
- Exact body: `get_symbol_context`.
- Impact analysis: `find_usages` or `find_callers`.
- Read MCP output by summary, ranking reasons, next steps, and resource URIs before expanding context.
- After edits: build/test, inspect diff, then reimport when needed.

Installed CodeMap skills live under `.codex/skills/codemap-*`:
- `codemap-brainstorming` — design-first workflow with hard gate before implementation
- `codemap-writing-plans` — decision-complete plan after approved design
- `codemap-executing-plans` — execute approved plans in scoped steps
- `codemap-test-driven-development` — RED → GREEN → REFACTOR using CodeMap tools
- `codemap-verification-before-completion` — final diff/build/index/reimport gate
