# CodeMap Task Lifecycle

1. Orient with `get_project`.
2. Explore with the narrowest useful CodeMap tool — if two calls don't converge on the root cause, switch to direct `Read`/grep instead of repeating MCP calls.
3. Read outlines and symbol bodies before full files.
4. Edit only the files needed for the task.
5. Verify with the smallest sufficient build/test.
6. Inspect the diff.
7. Call `refresh_local_index` after local edits.
8. Call `reimport` only when cloud graph/insights should refresh.
9. Summarize changes, verification, blockers, and remaining risks.
