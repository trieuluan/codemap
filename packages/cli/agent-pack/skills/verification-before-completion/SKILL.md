---
name: codemap-verification-before-completion
description: "CodeMap skill: codemap-verification-before-completion"
---

# Verification Before Completion

Use this skill after any task that changed files. It is the final gate before telling the user the work is done.

## Checklist

1. **Inspect changes**
   - Call `diff(mode="working")`.
   - Confirm only intended files changed.
   - Mention unrelated dirty files if present.

2. **Run checks**
   - Run the smallest sufficient build or test command.
   - If the repository has dependency ordering rules, build dependencies before consumers.
   - If a check cannot run, explain why and what risk remains.

3. **Refresh indexes**
   - Call `refresh_local_index` after local code edits.
   - Use `reimport` and `reimport(wait=true)` only when cloud graph/insights or paid workspace cloud indexing should update.

4. **Final response**
   - Summarize changed behavior.
   - List verification results.
   - Call out skipped checks, blockers, or residual risk.

