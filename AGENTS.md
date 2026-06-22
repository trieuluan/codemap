# AGENTS.md

Use CodeMap MCP before raw file reads or grep.

- Start with `get_project`.
- Broad implementation/debug/review/refactor/test/research tasks with unclear files: `explore_task`.
- Follow relevant skills, hard gates, artifact templates, and verification checklist.
- Related files: `find_related_files`.
- Known symbols/files: `search_codebase`.
- Several candidates: `get_file`.
- Exact body: `symbol`.
- Impact analysis: `symbol`.
- Read MCP output by summary, ranking reasons, next steps, and resource URIs before expanding context.
- After edits: build/test, inspect diff, then reimport when needed.

Installed CodeMap skills live under `.agents/skills/codemap-*`:
- `codemap-brainstorming` — design-first workflow with hard gate before implementation
- `codemap-writing-plans` — decision-complete plan after approved design
- `codemap-executing-plans` — execute approved plans in scoped steps
- `codemap-test-driven-development` — RED → GREEN → REFACTOR using CodeMap tools
- `codemap-verification-before-completion` — final diff/build/index/reimport gate
- `codemap-systematic-debugging` — Use when debugging: 4-phase root cause process with Iron Law
- `codemap-symbol-level-debugging` — Use when a bug centers on a specific function/class/method
- `codemap-feature-area-investigation` — Use when investigating a named product area (auth, billing, CLI, etc.)
- `codemap-safe-edit-and-reimport` — Use before editing files: scoped edit + diff + index refresh pattern
- `codemap-ponytail` — Use before writing or editing any code: 6-step decision ladder to avoid over-engineering
- `codemap-receiving-code-review` — Use when receiving code review feedback on a PR or diff
- `codemap-requesting-code-review` — Use when you want to dispatch a code reviewer subagent
- `codemap-finishing-a-development-branch` — Use when ready to merge or close a development branch
- `codemap-subagent-driven-development` — Use when orchestrating parallel subagents for complex tasks

