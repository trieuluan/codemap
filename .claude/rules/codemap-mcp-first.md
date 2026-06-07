# CodeMap MCP-First Rule

When CodeMap MCP is available, use CodeMap tools before raw file reads or grep.

## Default Tool Routing

Choose the tool by task shape, not by a rigid sequence:

- New CodeMap session: `get_project`.
- Broad implementation/debug/review/refactor/test/research task with unclear files: `explore_task`.
- Related-file question or known anchor file/symbol: `find_related_files`.
- Known symbol/file/export/keyword: `search_codebase`.
- Several candidates: `get_file` with outlines first.
- Specific body: `get_file(include=["symbols"], symbol_names=[...])` or `symbol`.
- Impact analysis: `symbol`, callers/usages, or `get_file` with `blast_radius`.
- After edits: `diff(mode="working")`, build/test, then `refresh_local_index`; reimport only when cloud graph/insights should refresh.

Read MCP output in this order: summary, ranked files/symbols, score reasons, next steps, and resource URIs. Expand to raw files only when the ranked context is not enough to answer or edit safely.

Raw reads and grep are fallback tools for unindexed files, dynamic searches, generated/copied asset content, or MCP gaps.

## Quick Decisions

- User asks to fix/implement/investigate and files are unclear → `explore_task`.
- User asks “which files are related?” → `find_related_files`.
- You already know the exact file/symbol → inspect that directly; do not re-query MCP for the same target.
- Need only one function/class body → prefer symbol-level reads over full-file reads.
- Need dynamic string or copied markdown asset search → use raw search/grep after MCP stops narrowing.

## When to Break the MCP-First Pattern

MCP-first is a default ordering, not an unconditional loop. Stop calling CodeMap tools and switch to direct `Read`/grep when any of these happen:

- Two consecutive CodeMap calls return results that do not narrow the problem (low-confidence matches, empty results, or context unrelated to the reported symptom).
- The task needs a dynamic/string-literal search, an unindexed file, generated/copied asset content, or content CodeMap does not cover.
- You already know the exact file/symbol location from a prior call — re-querying CodeMap for the same target wastes a turn.

In these cases, drop to raw reads/grep immediately, finish the investigation, and note in the summary why you stepped outside MCP-first.

## Avoid Unnecessary Subagents

Do not spawn Agent/subagent for work that can be done directly with CodeMap tools and local commands:

- Broad bug/feature investigation → `explore_task`.
- Related-file scans → `find_related_files`.
- Symbol lookup → `search_codebase` or `symbol`.
- File audit → `get_file` outlines or local file reads.

Spawn subagents only when the task truly needs long-running parallel research/execution or the user explicitly asks.
