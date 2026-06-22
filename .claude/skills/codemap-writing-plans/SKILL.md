---
name: codemap-writing-plans
description: "Use after a design is approved — write a decision-complete implementation plan before touching any file"
---

# Writing Plans

Use this skill after a design is approved and before implementation begins. The goal is a decision-complete plan that another agent can execute without guessing.

## Hard Gate

Do not edit production files while writing the plan. Implementation starts only after the plan is accepted or the user explicitly asks to execute it.

## Process

1. **Re-ground in CodeMap context**
   - Use the narrowest CodeMap context tool to confirm affected files, symbols, and risks.
   - Inspect only the outlines or symbols needed to make implementation decisions.

2. **Write a concrete implementation plan**
   - Use `codemap://agent-pack/templates/implementation-plan`.
   - Include exact files or modules to touch when they are known.
   - Include ordered steps, interfaces, edge cases, and verification commands.
   - State assumptions clearly instead of leaving choices for the implementer.

3. **Check execution safety**
   - Confirm no unrelated refactors are included.
   - Confirm how to preserve user changes in a dirty worktree.
   - Confirm the smallest sufficient test/build command.

4. **Wait for approval when required**
   - New features and high-risk changes require user approval before implementation.
   - Low-risk fixes may proceed after a lightweight plan if the user has already asked for execution.

## Output

Return a concise plan with: summary, key edits, verification, and assumptions.

