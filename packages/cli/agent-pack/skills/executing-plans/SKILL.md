---
name: codemap-executing-plans
description: "Use when implementing an approved plan — execute steps in order, one at a time, with verification after each"
---

# Executing Plans

Use this skill when implementing an approved plan. Follow the plan in order and keep the edit surface narrow.

## Process

1. **Before edits**
   - Read the approved plan.
   - Call `diff(mode="working")` and note unrelated dirty files.
   - Read only the CodeMap context needed for the next step.

2. **During implementation**
   - Execute one logical plan step at a time.
   - Keep behavior and file ownership aligned with the plan.
   - If reality contradicts the plan, pause to revise the plan instead of improvising a broad rewrite.

3. **After edits**
   - Run the planned checks.
   - Call `diff(mode="working")` to inspect the actual changed files.
   - Use `refresh_local_index` after local edits.
   - Use `reimport` only when cloud graph/insights or paid cloud indexing should refresh.

## Rule

Do not declare completion until `verification-before-completion` is satisfied.

