# CodeMap Workflow Skills

## Start Here: Workflow Recommendation

For broad work, call `recommend_agent_workflow(task)` before implementing. Follow the returned required skills, hard gates, first tools, artifact templates, and verification checklist.

## Brainstorming (design before code)

For new features or vague requirements, design first — never write production code before the design is approved.

1. Call `explore_task` and `summarize_feature_area` to gather real codebase context.
2. Ask clarifying questions one at a time until scope is clear.
3. Propose 2–3 approaches with trade-offs, referencing real files from CodeMap.
4. Write a design doc (`docs/specs/YYYY-MM-DD-<topic>.md`) covering goal, approach, affected files, and open questions.
5. Self-review the spec, then wait for user approval before touching any file.

## Test-Driven Development

For new functionality or bug fixes, follow RED → GREEN → REFACTOR strictly.

- **RED**: `search_codebase("test <feature>")` to find patterns, write a minimal failing test, run with the host agent test runner and confirm it **fails**.
- **GREEN**: Use `get_symbol_context` to read the target, implement only the minimum to pass, run the host agent test runner and confirm it **passes**.
- **REFACTOR**: Clean up, run the host agent test runner again, then call `code_review` and `get_working_diff` before declaring done.

No production code before a failing test exists.

## Writing Plans

Use after a design is approved and before implementation begins.

1. Re-ground with CodeMap using the tools recommended by `recommend_agent_workflow`.
2. Use `codemap://agent-pack/templates/implementation-plan`.
3. Write exact steps, files/modules, interfaces, edge cases, and verification commands.
4. Remove decisions from the implementer; record assumptions explicitly.
5. Wait for approval when the task is high-risk or product-facing.

## Executing Plans

Use when implementing an approved plan.

1. Call `get_working_diff` before edits and preserve unrelated user changes.
2. Execute one plan step at a time.
3. If reality contradicts the plan, revise the plan instead of broad improvisation.
4. Run planned verification, inspect diff, then refresh local index.

## Verification Before Completion

Use after every file-changing task.

1. Call `get_working_diff`.
2. Run the smallest relevant build/test command.
3. Call `refresh_local_index` after local edits.
4. Decide whether `trigger_reimport` and `wait_for_import` are needed for cloud graph/insights.
5. Report changed behavior, verification results, skipped checks, and residual risk.

## Feature Area Investigation

Use when the task involves a named feature (billing, auth, admin, graph, etc.).

1. Call `summarize_feature_area(query)` — read confidence level and recommended order.
2. Call `get_files([...])` on the top results to survey outlines without loading full files.
3. Use `get_symbol_context` for the most relevant component, service, or controller.
4. If still unclear, call `find_related_files` anchored to the best file found.

## Symbol-Level Debugging

Use when a bug or behavior centers on a specific function, class, component, or method.

1. `search_codebase(symbol_name)` if the file is unknown.
2. `get_symbol_context(symbol_name, file_path)` for the exact body.
3. `find_callers` or `find_usages` when call flow or impact matters.
4. Read only adjacent files needed to explain or change the behavior.

Do not read an entire large file to inspect one symbol when CodeMap can return symbol context.

## Interpreting CodeMap Output

After any CodeMap tool returns ranked files, symbols, or related files:

1. Read the summary first — decide if it is enough to act before expanding.
2. Prefer high-ranked results before low-ranked ones.
3. Follow `nextSteps`, `resourceUris`, and suggested tool calls before opening raw files.
4. Use ranking signals to filter: exact path/symbol match = strong; fuzzy keyword = weak.
5. Stop expanding context once the edit or answer is grounded enough.

When results look weak or noisy, refine the query, anchor to a known file or symbol, or switch tool.

## Token-Efficient Code Review

Use when reviewing changes in a CodeMap-indexed repository.

1. Start with `get_working_diff` or `get_diff`.
2. For changed symbols, use `get_symbol_context` instead of full-file reads.
3. Use `find_usages` or `find_callers` for risky public API or shared behavior changes.
4. Lead findings by severity. Mention test gaps and residual risk.

Review behavior and integration risks — avoid summarizing broad context unless it supports a finding.
