# CodeMap MCP-First Rule

When CodeMap MCP is available, use CodeMap tools before raw file reads or grep.

## Default Tool Routing

- New CodeMap session: `get_project`.
- Broad task: `explore_task`.
- Related-file question: `find_related_files`.
- Known symbol/file/export: `search_codebase`.
- Several candidates: `get_file`.
- Specific body: `symbol`.
- Impact analysis: `symbol`.
- After edits: `diff(mode="working")`, build/test, then reimport when needed.

Read MCP output in this order: summary, ranked files/symbols, score reasons, next steps, and resource URIs. Expand to raw files only when the ranked context is not enough to answer or edit safely.

Raw reads and grep are fallback tools for unindexed files, dynamic searches, or MCP gaps.

## When to Break the MCP-First Pattern

MCP-first is a default ordering, not an unconditional loop. Stop calling CodeMap tools and switch to direct `Read`/grep when any of these happen:

- Two consecutive CodeMap calls return results that do not narrow the problem (low-confidence matches, empty results, or context unrelated to the reported symptom).
- The task needs a dynamic/string-literal search, an unindexed file, or content CodeMap does not cover.
- You already know the exact file/symbol location from a prior call — re-querying CodeMap for the same target wastes a turn.

In these cases, drop to raw reads/grep immediately, finish the investigation, and note in the summary why you stepped outside MCP-first.

