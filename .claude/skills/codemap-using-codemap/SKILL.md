# Using CodeMap

Use this skill whenever you are working in a repository with CodeMap MCP available, especially before exploring, editing, reviewing, or debugging code.

## Workflow

1. Call `get_agent_workflow` at the start of a new CodeMap MCP session.
2. Call `get_project` to confirm the linked project and index health.
3. Choose a CodeMap MCP tool before raw file reads:
   - Broad task: `explore_task`.
   - Feature area: `summarize_feature_area`.
   - Related files: `find_related_files`.
   - Known symbol/file/export: `search_codebase`.
4. Use `get_files` for outlines across several files.
5. Use `get_symbol_context` or `get_file` only after narrowing the target.
6. After edits, run the smallest sufficient build/test, inspect `get_working_diff`, then reimport when the index should refresh.

## Rule

CodeMap is the context engine. Use it to reduce blind grep, broad raw reads, and unnecessary token spend.

