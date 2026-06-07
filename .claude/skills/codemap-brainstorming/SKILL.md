---
name: codemap-brainstorming
description: "CodeMap skill: codemap-brainstorming"
---

# Brainstorming

Use this skill when the user describes a new feature, a vague requirement, or says "design X", "plan X", or "how should we approach X". Do not write any code until the design is approved.

## Hard Gate

**Never write production code before completing this skill.** The design must be written and approved first, even for simple tasks.

## Process

1. **Gather real context with CodeMap**
   - `explore_task("feature or problem description")` — get likely files, entrypoints, risks
   - `get_project_insights()` — understand codebase size, language breakdown, patterns

2. **Ask clarifying questions** — one at a time, stop when the scope is unambiguous:
   - What is the expected input and output?
   - What edge cases or failure modes matter?
   - Are there existing patterns in the codebase to follow?

3. **Propose 2–3 approaches** with real file references from step 1:
   - State the trade-offs (complexity, blast radius, consistency with existing patterns)
   - Use `find_related_files` or `get_file(include=["outline"])` to back claims

4. **Write a design doc** to `docs/specs/YYYY-MM-DD-<topic>.md`:
   - Goal and non-goals
   - Chosen approach and why
   - Files to create/modify (with paths from CodeMap)
   - Data flow or API contract
   - Open questions

5. **Self-review the spec** — check for missing edge cases, unclear interfaces, or scope creep

6. **Wait for user approval** before proceeding to implementation

## After Approval

Invoke the task-lifecycle workflow: explore → confirm edit plan → implement → verify → diff → reimport.

## Rule

If the user skips design and asks to implement directly, acknowledge the risk and offer a one-paragraph lightweight design summary before touching any file.

