---
name: codemap-interpreting-codemap-output
description: "CodeMap skill: codemap-interpreting-codemap-output"
---
# Interpreting CodeMap Output

Use this skill after a CodeMap MCP tool returns ranked files, symbol context, related files, usages, callers, workflow guidance, or diff output.

## Reading Order

1. Read the summary first and decide whether the result is enough to act.
2. Prefer high-ranked files and symbols before expanding to lower-ranked matches.
3. Follow `nextSteps`, `resourceUris`, and related tool hints before opening raw files.
4. Treat snippets, outlines, symbol ranges, and score reasons as filters, not as a full substitute for code needed before editing.

## Token Discipline

- Use `get_files` for several candidate files instead of opening each file.
- Use `get_symbol_context` for a known function, component, class, or method body.
- Use `get_file` with line ranges when the tool output points to a precise span.
- Stop expanding context once the edit or answer is grounded enough.

## Ranking Signals

- Strong signals: exact file path, exact symbol name, direct export, direct import, caller/callee, route/API handler match.
- Medium signals: feature-area summary rank, related-file edge, same directory, shared service/component.
- Weak signals: fuzzy name match, generic loading/error files, broad utility files, low-score keyword-only hits.

When results look weak or noisy, refine the query, anchor it to a file or symbol, or switch from feature search to symbol/file search.

## Before Answering

Mention only the CodeMap result details that changed the decision: selected files, key symbols, and whether more raw reading was needed.

"