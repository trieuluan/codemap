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
