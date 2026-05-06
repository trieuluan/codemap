# Feature Area Investigation

Use this skill for feature questions like billing, auth redirect, admin project detail, import history, or graph canvas.

## Process

1. Call `summarize_feature_area(query)`.
2. Read the recommended order and confidence.
3. Call the suggested `get_files([...])` to inspect outlines without loading full files.
4. Use `get_symbol_context` for the most relevant component/service/controller.
5. If the area is still unclear, call `find_related_files` with the best anchor file.

## Output Expectation

Identify primary entrypoints, backend services/routes, frontend components/API clients, shared schema/types, and any secondary matches.
