---
name: codemap-feature-area-investigation
description: "CodeMap skill: codemap-feature-area-investigation"
---
# Feature Area Investigation

Use this skill for feature-area questions like authentication, billing, import history, graph canvas, CLI commands, integrations, or other named product areas.

## Process

1. Call `summarize_feature_area(query)`.
2. Read the recommended order and confidence.
3. Call the suggested `get_files([...])` to inspect outlines without loading full files.
4. Use `get_symbol_context` for the most relevant component/service/controller.
5. If the area is still unclear, call `find_related_files` with the best anchor file.

## Output Expectation

Identify primary entrypoints, domain modules, UI or CLI surfaces, data contracts/configuration, verification targets, and any secondary matches.

"