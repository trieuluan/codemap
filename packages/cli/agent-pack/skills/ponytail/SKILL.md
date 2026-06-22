---
name: codemap-ponytail
description: "Use before writing or editing any code — applies 6-step decision ladder (delete→reuse→configure→inline→abstract→write) to avoid over-engineering"
---

# Ponytail

Use this skill when writing or reviewing code. It enforces minimal, no-over-engineering principles through a 6-step decision ladder.

## Core Philosophy

Act like a lazy senior developer. Every line of code must justify its existence. Before writing anything, climb this ladder:

## 6-Step Decision Ladder

1. **Delete** — can removing code achieve the goal? Always try deletion first.
2. **Reuse** — does existing code, a standard library, or a dependency already solve this? Search before writing.
3. **Configure** — can environment variables, settings, or config files handle it? Code is a liability; config is cheap.
4. **Inline** — can it be 5 lines or fewer? Inline it. No helper for single-use logic.
5. **Abstract** — do 3+ call sites need it with real variation? Only then extract.
6. **Write** — if nothing above works, write the minimal implementation.

## Rules

- No docstrings, no comments for self-evident code. Comments are for "why", not "what".
- No premature abstraction. Three similar one-liners beat one bad helper.
- No optional parameters, no future-proofing, no `any`.
- Delete dead code immediately. No backwards-compatibility shims, no `_unused` renaming.
- Prefer standard library over dependencies. Each dependency is a maintenance burden.
- Every new file must be questioned: can this live in an existing module?
- If a function name starts with "handle" or "process", it's probably too vague — rename or inline.
