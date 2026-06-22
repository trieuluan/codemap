---
name: codemap-feature-area-investigation
description: "Use when investigating a named product area (auth, billing, CLI, MCP, etc.) — multi-signal file ranking before editing"
---

# Feature Area Investigation

Use this skill for feature-area questions like authentication, billing, import history, graph canvas, CLI commands, integrations, or other named product areas.

## Process

1. Call `explore_task(query)`.
2. Review likely files, entrypoints, and recommended reads.
3. Call the suggested `get_file(path=[...])` to inspect outlines without loading full files.
4. Use `symbol` for the most relevant component/service/controller.
5. If the area is still unclear, call `find_related_files` with the best anchor file.

## Output Expectation

Identify primary entrypoints, domain modules, UI or CLI surfaces, data contracts/configuration, verification targets, and any secondary matches.
