# GEMINI.md

Use CodeMap MCP before raw file reads or grep.

Default workflow:

1. Call `get_agent_workflow`, then `get_project`.
2. Use `explore_task` for broad implementation/debugging.
3. Use `summarize_feature_area` for feature keywords.
4. Use `find_related_files` for anchor file/symbol questions.
5. Use `search_codebase` for known symbols, exports, filenames, or keywords.
6. Use `get_files` for outlines and `get_symbol_context` for exact bodies.
7. After edits, build/test, inspect diff, and reimport when needed.

