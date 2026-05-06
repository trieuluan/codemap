# CodeMap MCP-First Rule

When CodeMap MCP is available, use CodeMap tools before raw file reads or grep.

## Default Tool Routing

- New CodeMap session: `get_agent_workflow`, then `get_project`.
- Broad task: `explore_task`.
- Feature keyword: `summarize_feature_area`.
- Related-file question: `find_related_files`.
- Known symbol/file/export: `search_codebase`.
- Several candidates: `get_files`.
- Specific body: `get_symbol_context`.
- Impact analysis: `find_usages` or `find_callers`.
- After edits: `get_working_diff`, build/test, then reimport when needed.

Raw reads and grep are fallback tools for unindexed files, dynamic searches, or MCP gaps.
