---
name: codemap-test-driven-development
description: "CodeMap skill: codemap-test-driven-development"
---
# Test-Driven Development

Use this skill when implementing new functionality or fixing a bug where tests are expected. Follow the RED → GREEN → REFACTOR cycle strictly.

## Hard Gate

**No production code before a failing test.** If you write implementation first, tests written afterward will pass immediately and prove nothing.

## Cycle

### RED — Write a failing test first
"
1. `search_codebase("test <feature>")` — find existing test files and patterns for this area
2. `get_file(test_file, include=["outline"])` — understand test structure and helpers
3. Write the minimal test that describes the desired behavior
4. `run_tests(pattern)` — confirm the test **fails** before proceeding
   - If the test passes immediately: it is testing existing behavior, not new behavior — revise it

### GREEN — Implement the minimum to pass

1. `get_symbol_context(symbol, file_path)` — read the exact function/class to modify
2. `find_callers(path, symbol)` — understand call context before changing signatures
3. Write only the code needed to make the failing test pass — no extra logic
4. `run_tests(pattern)` — confirm the test now **passes**

### REFACTOR — Clean up without breaking

1. Improve naming, extract helpers, remove duplication
2. `run_tests(pattern)` — confirm all tests still pass after cleanup
3. `get_working_diff` — review final scope of changes

## Rules

- One behavior per test — keep tests minimal and named after the behavior, not the implementation
- Prefer real code over mocks when the actual module is fast enough to call
- If `run_tests` is unavailable for the project, state this explicitly and describe the manual verification steps taken instead
- Never declare the task complete without showing that tests pass

