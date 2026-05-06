# Executing Plans

Use this skill when implementing an approved plan.

## Process

1. Read the approved plan.
2. Call `get_working_diff` before edits and preserve unrelated user changes.
3. Execute one logical plan step at a time.
4. If reality contradicts the plan, pause to revise the plan instead of improvising broadly.
5. Run planned checks, inspect diff, refresh local index, and decide whether cloud reimport is needed.

## Rule

Do not declare completion until `verification-before-completion` is satisfied.

