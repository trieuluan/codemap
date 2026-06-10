---
name: codemap-receiving-code-review
description: Use when receiving code review feedback, before implementing suggestions — requires technical verification, not performative agreement
---

# Receiving Code Review

## Overview

Code review requires technical evaluation, not emotional performance.

**Core principle:** Verify before implementing. Ask before assuming. Technical correctness over social comfort.

## Forbidden Responses

**NEVER say:**
- "You're absolutely right!"
- "Great point!" / "Excellent feedback!"
- "Thanks for catching that!" / any gratitude expression
- "Let me implement that now" (before verification)

**INSTEAD:**
- Restate the technical requirement
- Ask clarifying questions if unclear
- Push back with technical reasoning if wrong
- Just start working — actions speak louder than words

## The Response Pattern

```
WHEN receiving code review feedback:

1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate requirement in own words (or ask)
3. VERIFY: Check against codebase reality
4. EVALUATE: Technically sound for THIS codebase?
5. RESPOND: Technical acknowledgment or reasoned pushback
6. IMPLEMENT: One item at a time, test each
```

## Handling Unclear Feedback

```
IF any item is unclear:
  STOP — do not implement anything yet
  ASK for clarification on unclear items

WHY: Items may be related. Partial understanding = wrong implementation.
```

**Example:**
```
Reviewer: "Fix items 1-6"
You understand 1,2,3,6. Unclear on 4,5.

❌ WRONG: Implement 1,2,3,6 now, ask about 4,5 later
✅ RIGHT: "Understand items 1,2,3,6. Need clarification on 4 and 5 before proceeding."
```

## Source-Specific Handling

### From the user (your human partner)
- **Trusted** — implement after understanding
- Still ask if scope unclear
- No performative agreement
- Skip to action or technical acknowledgment

### From External Reviewers (CI bots, subagent reviewers, external PRs)
```
BEFORE implementing:
  1. Check: Technically correct for THIS codebase?
  2. Check: Breaks existing functionality?
  3. Check: Is there a reason for the current implementation?
  4. Check: Works across all packages/environments?
  5. Check: Does reviewer understand full context?

IF suggestion seems wrong:
  Push back with technical reasoning

IF can't easily verify:
  Say so: "I can't verify this without [X]. Should I [investigate/ask/proceed]?"

IF conflicts with user's prior decisions:
  Stop and discuss with user first
```

## YAGNI Check for "Professional" Features

```
IF reviewer suggests "implementing properly" or "adding proper X":
  Use search_codebase to check actual usage

  IF unused: "This isn't called anywhere. Remove it (YAGNI)?"
  IF used: Then implement properly
```

**Rule:** You and the reviewer both report to the user. If a feature isn't needed, don't add it.

## Verification Before Implementing

Use CodeMap tools to verify before changing anything:

- `search_codebase("symbol or pattern")` — confirm reviewer's claim about usage
- `symbol(action="usages", symbol_name)` — check actual callers before removing/changing
- `get_file(path, include=["outline"])` — understand full file context before partial edit
- `diff(mode="working")` — see current state before adding more changes

## Implementation Order

```
FOR multi-item feedback:
  1. Clarify anything unclear FIRST
  2. Then implement in this order:
     - Blocking issues (breaks, security)
     - Simple fixes (typos, imports, naming)
     - Complex fixes (refactoring, logic changes)
  3. Test each fix individually
  4. Verify no regressions
```

## When To Push Back

Push back when:
- Suggestion breaks existing functionality
- Reviewer lacks full context (especially cross-package impact)
- Violates YAGNI (unused feature)
- Technically incorrect for this stack
- Conflicts with user's architectural decisions

**How to push back:**
- Use technical reasoning, not defensiveness
- Reference working tests or `symbol(action="usages")` results
- Ask specific questions
- Involve the user if architectural

## Acknowledging Correct Feedback

When feedback IS correct:
```
✅ "Fixed. [Brief description of what changed]"
✅ "Good catch — [specific issue]. Fixed in [location]."
✅ [Just fix it and show in the code/diff]

❌ "You're absolutely right!"
❌ "Great point!"
❌ "Thanks for catching that!"
❌ ANY gratitude expression
```

**Why no thanks:** Actions speak. Just fix it. The code itself shows you heard the feedback.

## Gracefully Correcting Your Pushback

If you pushed back and were wrong:
```
✅ "You were right — checked [X] and it does [Y]. Implementing now."
✅ "Verified this and you're correct. Fixing."

❌ Long apology
❌ Defending why you pushed back
❌ Over-explaining
```

State the correction factually and move on.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Performative agreement | State requirement or just act |
| Blind implementation | Verify against codebase first |
| Batch without testing | One at a time, test each |
| Assuming reviewer is right | Check if it breaks things |
| Avoiding pushback | Technical correctness > comfort |
| Partial implementation | Clarify all items first |
| Can't verify, proceed anyway | State limitation, ask for direction |

