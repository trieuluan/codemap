---
name: codemap-writing-plans
description: "CodeMap skill: codemap-writing-plans"
---
# Writing Plans

Use this skill after a design is approved and before implementation begins. The goal is a decision-complete plan that another agent can execute without guessing.

## Hard Gate

Do not edit production files while writing the plan. Implementation starts only after the plan is accepted or the user explicitly asks to execute it.

## Process

1. Re-ground with the narrowest CodeMap context tool for the task shape.
2. Confirm affected files, symbols, risks, and verification commands.
3. Use `codemap://agent-pack/templates/implementation-plan`.
4. Write exact steps, files/modules, interfaces, edge cases, assumptions, and checks.
5. Wait for approval when the task is high-risk or product-facing.

## Output

Return a concise plan with summary, key edits, verification, and assumptions.

"