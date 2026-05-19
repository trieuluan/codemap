# AGENTS.md

Use CodeMap MCP only when repository context is needed. Do not call CodeMap for normal chat, theory questions, or tasks unrelated to this repo.

- Start a new coding session with `get_agent_workflow` once; do not repeat it in the same session unless workflow context is lost.
- Do not call `get_project`/`list_projects` unless the user asks for project/account/cloud status.
- Broad implementation/debug/review/refactor/test/research tasks with unclear files: call `recommend_agent_workflow`, then `explore_task` when repo context is needed.
- Feature areas: `summarize_feature_area`; related files: `find_related_files`; known symbols/files: `search_codebase`.
- Prefer `get_files` outlines before reading content.
- Prefer symbol reads: `get_symbol_context` or `get_file(include=["symbols"], symbol_names=[...])`; avoid full-file reads unless needed.
- Impact analysis: `find_usages` or `find_callers`.
- For small tasks where the exact file/pattern is already known, use `rg`/shell directly instead of CodeMap.
- After edits: build/test, inspect diff, refresh local index when useful; trigger cloud reimport only when requested or needed for web graph/insights.

Installed CodeMap skills live under `.codex/skills/codemap-*`:
- `codemap-brainstorming` — design-first workflow with hard gate before implementation
- `codemap-writing-plans` — decision-complete plan after approved design
- `codemap-executing-plans` — execute approved plans in scoped steps
- `codemap-test-driven-development` — RED → GREEN → REFACTOR using CodeMap tools
- `codemap-verification-before-completion` — final diff/build/index/reimport gate

## Imported Claude Cowork project instructions
