---
name: codemap-verification-before-completion
description: "CodeMap skill: codemap-verification-before-completion"
---
# Verification Before Completion

Use this skill after any task that changed files.

## Checklist

1. Call `get_working_diff` and confirm only intended files changed.
2. Run the smallest relevant build or test command.
3. Call `refresh_local_index` after local code edits.
4. Decide whether cloud `trigger_reimport` and `wait_for_import` are needed.
5. Final response must include changed behavior, verification results, skipped checks, and residual risk.

"