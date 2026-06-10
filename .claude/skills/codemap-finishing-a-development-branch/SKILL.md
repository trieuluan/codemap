---
name: codemap-finishing-a-development-branch
description: Use when implementation is complete and tests pass — guides branch completion with structured merge/PR/keep/discard options
---

# Finishing a Development Branch

## Overview

Completing a branch requires a structured verification and decision process — not just pushing code.

## Prerequisites

Before using this skill:
1. Implementation is done
2. Code review has been requested (`codemap-requesting-code-review`)
3. Review feedback has been addressed (`codemap-receiving-code-review`)

## Step 1: Verify Tests Pass

```bash
# Run the test suite
pnpm test                     # or relevant test command

# TypeScript check
pnpm --filter @codemap-ai/cli run build:tsc
pnpm --filter @codemap-ai/mcp run build:tsc
```

**If tests fail:** Do NOT proceed. Fix tests first.

**If no automated tests exist:** Manually verify the core behavior works as expected and document what you tested.

## Step 2: Verify Code State

```
diff(mode="working")
```

- Any uncommitted changes? Commit them or stash them.
- Any debug code, TODOs, or half-done work? Clean up first.
- Are all changes intentional and scoped to the task?

Also check:
```
refresh_local_index
```

Ensure local MCP index is up to date before completing.

## Step 3: Determine Base Branch

```bash
git log --oneline -5          # see recent commits on this branch
git branch -vv                # see tracking branch
```

For this repo: base is typically `master`.

## Step 4: Present Options

Present the user with exactly these 4 options:

```
Tests pass. Branch is clean. Choose next step:

1. Merge locally — merge branch into master locally
2. Push + PR — push branch and create a pull request
3. Keep as-is — leave branch for later; no merge/push
4. Discard — discard all changes and delete branch
```

**Wait for user to choose.** Do not assume.

## Step 5: Execute

### Option 1: Merge Locally

```bash
git checkout master           # (or main)
git merge --no-ff <branch>    # preserve branch history
git branch -d <branch>        # clean up local branch
```

Verify after merge:
```bash
pnpm test                     # confirm tests still pass on master
```

### Option 2: Push + PR

```bash
git push origin <branch>
```

Then create the PR:
```bash
gh pr create \
  --title "<Imperative title: what this does>" \
  --body "## Summary

<2-3 sentences: what changed and why>

## Test Plan

<what was tested and how>

## Related

<any related issues or PRs>" \
  --base master
```

**PR title rules:**
- Imperative mood: "Add FTS5 search", "Fix watcher startup race"
- Describe the whole unit of work
- No "WIP", no ticket numbers as title

### Option 3: Keep As-Is

```bash
# Nothing to do — just confirm current state
git log --oneline -3
git status
```

Note what's left to do before this branch can be completed.

### Option 4: Discard

```bash
git checkout master
git branch -D <branch>        # -D force-deletes even with unpushed commits
```

**Confirm with user before running this.** This is irreversible.

## Step 6: Post-Completion Cleanup

After options 1 or 2:
- `refresh_local_index` — update local MCP index to reflect merged state
- Note any follow-up work in a brief summary

## Quick Reference

| Option | Action | Cleanup |
|--------|--------|---------|
| 1. Merge locally | `git merge --no-ff` | `git branch -d` |
| 2. Push + PR | `git push` + `gh pr create` | (after merge) |
| 3. Keep | Nothing | — |
| 4. Discard | `git branch -D` | Confirm first |

## Related Skills

- **codemap-requesting-code-review** — do this before finishing
- **codemap-verification-before-completion** — verify work is complete before this step
- **codemap-executing-plans** — the implementation step that precedes this

