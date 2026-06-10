---
name: codemap-subagent-driven-development
description: Use when executing implementation plans with multiple independent tasks in the current session
---

# Subagent-Driven Development

## Overview

For plans with multiple independent tasks: delegate each to a fresh implementer subagent, then run two-stage review before proceeding.

**Core principle:** Fresh context per task. Two-stage quality gate. Continuous execution without pausing.

## When to Use

Use when:
- You have an approved plan with 2+ independent implementation tasks
- Each task can be specified clearly enough for a subagent to implement without parent context
- You want to parallelize or keep implementation context clean

**Do NOT use when:**
- Tasks are tightly sequential (each depends on the output of the previous)
- The task is a single coherent change best done in one pass
- You're in a debugging session (use `codemap-systematic-debugging` instead)

## The Continuous Execution Rule

```
DO NOT pause between tasks to update the user.
DO NOT pause between review stages.
DO NOT ask permission to proceed to the next task.
CONTINUE autonomously until all tasks are complete or blocked.
Only stop at genuine blockers: NEEDS_CONTEXT or BLOCKED status.
```

The user approved the plan. Execute it.

## Workflow Per Task

```
FOR each task in the approved plan:
  1. Write implementer prompt (see template below)
  2. Dispatch implementer subagent (forked: false — self-contained context)
  3. Receive DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED status
  4. IF DONE or DONE_WITH_CONCERNS:
       → Run spec compliance review (Stage 1)
       → Run code quality review (Stage 2)
       → If clean: continue to next task
       → If issues: fix, re-review if substantial
  5. IF NEEDS_CONTEXT:
       → Provide missing context
       → Re-dispatch implementer
  6. IF BLOCKED:
       → Stop on this task
       → Surface blocker to user
       → Continue other unblocked tasks if any
```

## Implementer Statuses

| Status | Meaning | Your Response |
|--------|---------|---------------|
| `DONE` | Complete, confident, tests pass | Proceed to two-stage review |
| `DONE_WITH_CONCERNS` | Complete but has concerns or uncertainties | Proceed to review; treat concerns as review items |
| `NEEDS_CONTEXT` | Blocked on missing information it couldn't infer | Provide context, re-dispatch |
| `BLOCKED` | Hard blocker: broken environment, conflicting code, impossible requirement | Surface to user before continuing |

## Implementer Prompt Template

```
## Task

[TASK_TITLE]

## Objective

[1-3 sentences: what this task should accomplish]

## Relevant Files

[List of file paths from explore_task / search_codebase]
OR: "Use explore_task('[task keyword]') to find relevant files"

## Context

[Any specific constraints, patterns to follow, interfaces to match]

## Specification

[Exact behavior expected — inputs, outputs, edge cases]

## Definition of Done

- [ ] [Specific verifiable criterion]
- [ ] Tests pass (or behavior verified if no test suite)
- [ ] TypeScript compiles clean

## Instructions

1. Start with explore_task or search_codebase to understand current code
2. Read relevant files with get_file before editing
3. Implement the minimum to satisfy the spec
4. Verify with the smallest relevant build/test
5. End your response with one of:
   - STATUS: DONE
   - STATUS: DONE_WITH_CONCERNS — [brief description]
   - STATUS: NEEDS_CONTEXT — [what you need]
   - STATUS: BLOCKED — [what blocks you]
```

## Stage 1: Spec Compliance Review

Dispatch BEFORE code quality review. This checks: "Did we build the right thing?"

```
## Spec Compliance Review

Review the following implementation against the spec.

## Spec

[Copy the exact spec and definition of done from the implementer prompt]

## Implementation

[Summary or diff of what was implemented]

## Review Questions

1. Does the implementation satisfy every item in the spec?
2. Are the Definition of Done criteria met?
3. Is anything missing or out of scope?

Return: COMPLIANT or list of spec gaps (not style/quality issues).
```

## Stage 2: Code Quality Review

Dispatch AFTER spec compliance is confirmed. This checks: "Did we build it well?"

Use `codemap-requesting-code-review` for the prompt template.

Key checks for this stage:
- Logic errors and edge cases
- Error handling
- Type safety
- No regressions (use `symbol(action="callers")` to verify)
- Tests adequate

## Model Selection

When your runtime supports model selection:

| Role | Model | Why |
|------|-------|-----|
| Implementer | Balanced/capable | Needs to read + write code correctly |
| Spec reviewer | Cheaper/fast | Mechanical checklist comparison |
| Quality reviewer | Capable | Needs to catch subtle bugs |
| Orchestrator (you) | Capable | Plans, routes, synthesizes |

If no model selection: use the same model for all roles.

## Parallelization

Independent tasks with no shared state can be dispatched in parallel:

```
IF task_A and task_B touch different files AND have no shared state:
  Dispatch both implementers simultaneously
  Collect both results before running reviews
  Review each independently
```

**Do NOT parallelize** if tasks touch the same files or depend on each other's output.

## Example Session Flow

```
Plan: [Task A, Task B, Task C]

→ Dispatch implementer for Task A
← STATUS: DONE
→ Stage 1: Spec review → COMPLIANT
→ Stage 2: Quality review → LGTM
→ Dispatch implementer for Task B
← STATUS: DONE_WITH_CONCERNS — "Changed interface signature, may affect callers"
→ Stage 1: Spec review → COMPLIANT
→ Stage 2: Quality review → IMPORTANT: verify callers
→ Fix caller update, re-verify
→ Dispatch implementer for Task C
← STATUS: NEEDS_CONTEXT — "Which config format to use?"
→ Provide context: "Use JSON, matching existing .codemap/mcp.json"
→ Re-dispatch implementer for Task C
← STATUS: DONE
→ Stage 1 + Stage 2 → LGTM

→ codemap-verification-before-completion
→ codemap-finishing-a-development-branch
```

## Related Skills

- **codemap-executing-plans** — for single-agent sequential plan execution (simpler)
- **codemap-requesting-code-review** — the quality review template
- **codemap-receiving-code-review** — how to handle review feedback
- **codemap-verification-before-completion** — final gate after all tasks complete
- **codemap-finishing-a-development-branch** — branch completion after all tasks done

