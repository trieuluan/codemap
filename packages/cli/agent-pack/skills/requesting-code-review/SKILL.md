---
name: codemap-requesting-code-review
description: Use when completing implementation or before merging — dispatch a code reviewer subagent to catch issues early
---

# Requesting Code Review

## Overview

Dispatch a fresh code reviewer subagent after completing implementation. A reviewer with fresh eyes catches issues the implementer can't see.

## When to Request Review

**Mandatory:**
- After completing each implementation task in a multi-task session
- After any change that touches > 2 files
- Before merging to the main branch
- After a bugfix (to verify root cause was actually fixed)

**Optional but recommended:**
- After any change to shared utilities or public APIs
- When you feel unsure about a design decision

**Not required:**
- Typo fixes, documentation-only changes, single-line non-logic edits

## Getting the Diff

Before dispatching the reviewer, get the diff they'll review:

**For uncommitted changes:**
```
diff(mode="working")
```

**For a committed branch vs base:**
```
# Get the SHAs
BASE_SHA = git merge-base HEAD origin/master  (or origin/main)
HEAD_SHA = git rev-parse HEAD

diff(mode="ref", from=BASE_SHA, to=HEAD_SHA)
```

## Dispatching the Reviewer

Spawn a reviewer subagent with the following prompt. Fill in `[DIFF]` and `[CONTEXT]`:

---

**Reviewer Subagent Prompt Template:**

```
You are a code reviewer. Review the following diff carefully.

## Context
[CONTEXT: 2-3 sentences about what the change is trying to accomplish]

## Diff
[DIFF: paste output from diff tool here]

## Review Instructions

Use CodeMap tools to explore context as needed:
- search_codebase("symbol or pattern") — to verify usage claims
- get_file(path, include=["outline"]) — to understand file structure
- symbol(action="context", symbol_name) — to read function bodies

Categorize each issue:
- CRITICAL: Breaks functionality, security issue, data loss risk
- IMPORTANT: Logic error, missing error handling, performance problem
- MINOR: Naming, formatting, style, minor improvements

For each issue, provide:
1. Category (CRITICAL / IMPORTANT / MINOR)
2. File and line reference
3. What the problem is
4. Why it matters
5. Suggested fix (concrete, not vague)

If no issues: Say "LGTM — no issues found." and briefly explain why the change looks correct.

Focus on:
- Correctness and edge cases
- Error handling and failure modes
- Type safety
- Backwards compatibility (if applicable)
- Tests: are they sufficient?

Do NOT flag:
- Style preferences without clear correctness impact
- Hypothetical future issues that don't apply to this change
- Things that were already there before this diff
```

---

## Processing the Review

After the reviewer returns:

### Severity Triage

```
CRITICAL issues → Fix immediately before continuing
IMPORTANT issues → Fix in this session
MINOR issues → Fix if time permits; note if skipping
```

### Responding to the Review

Read the `codemap-receiving-code-review` skill before implementing feedback.

Key rules:
- Verify before implementing (use CodeMap tools)
- Push back with technical reasoning if a suggestion is wrong
- No performative agreement

### If LGTM

Document that the review was done. Continue to branch completion.

## After Review

1. Fix all CRITICAL and IMPORTANT issues
2. Run tests to confirm nothing broken: relevant test command
3. `diff(mode="working")` — confirm scope of changes
4. `refresh_local_index` — update local MCP index
5. Request another review if fixes were substantial

## Quick Reference

| Step | Action |
|------|--------|
| 1 | Get diff: `diff(mode="working")` or `diff(mode="ref")` |
| 2 | Dispatch reviewer subagent with template |
| 3 | Receive review |
| 4 | Triage: CRITICAL → IMPORTANT → MINOR |
| 5 | Read `codemap-receiving-code-review`, implement fixes |
| 6 | Verify fixes, re-review if substantial |

## Related Skills

- **codemap-receiving-code-review** — how to handle the feedback you receive
- **codemap-finishing-a-development-branch** — use after review is clean
- **codemap-verification-before-completion** — final gate before declaring done
