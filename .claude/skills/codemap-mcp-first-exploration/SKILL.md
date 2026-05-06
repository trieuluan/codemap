# MCP-First Exploration

Use this skill when the task starts with unclear files, a broad bug/feature request, or a question like "where should I look?"

## Tool Choice

- `explore_task`: broad implementation or debugging task.
- `summarize_feature_area`: feature keyword like billing, auth, admin import history.
- `find_related_files`: anchor file, symbol, or "which files are related?"
- `search_codebase`: known file, symbol, export, or keyword.
- `get_files`: compact outlines for multiple candidates.
- `get_symbol_context`: exact function/component/class body.

## Process

1. Ask CodeMap for a ranked shortlist.
2. Read outlines before full files.
3. Prefer symbol bodies over whole-file reads.
4. Fall back to raw search only for unindexed files, dynamic string searches, or tool gaps.

