---
name: codemap-safe-edit-and-reimport
description: "CodeMap skill: codemap-safe-edit-and-reimport"
---
# Safe Edit And Reimport

Use this skill when making code changes in a CodeMap-indexed repository.

## Process

1. Narrow the affected files with CodeMap before editing.
2. Keep edits scoped to the user request and existing local patterns.
3. Run the smallest sufficient build/test for the changed package or feature area. If the repository has dependency ordering rules, build dependencies before consumers.
4. Call `diff(mode="working")` or use git diff to review scope.
5. Call `refresh_local_index` after local code/index/rule changes. Call `reimport` and `reimport(wait=true)` only when cloud graph/insights or cloud indexing should refresh, or when asked.

## Rule

Never declare the task complete without saying what was verified or why verification was skipped.

"