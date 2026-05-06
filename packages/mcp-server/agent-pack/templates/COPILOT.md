# COPILOT.md

Use CodeMap MCP as the first context source for codebase work.

- Prefer CodeMap tools before raw file reads.
- Use `summarize_feature_area`, `find_related_files`, or `search_codebase` to locate files.
- Use `get_files` and `get_symbol_context` to keep context small.
- Use `find_usages` and `find_callers` for impact analysis.
- Read MCP summaries, ranking reasons, next steps, and resource URIs before expanding context.
- Verify with focused build/test commands and reimport after meaningful changes.
