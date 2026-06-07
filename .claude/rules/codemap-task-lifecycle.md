# CodeMap Task Lifecycle

1. Orient with the narrowest useful CodeMap tool: `get_project` for a new session, `explore_task` for broad unclear work, `find_related_files` for related-file questions, or direct file/symbol inspection when the user named exact targets.
2. If two CodeMap calls do not converge on the root cause, switch to direct `Read`/grep instead of repeating MCP calls.
3. Read outlines and symbol bodies before full files.
4. Edit only the files needed for the task; keep command/tool handlers thin and delegate reusable logic to the right package.
5. Verify with the smallest sufficient build/test.
6. Inspect the working diff.
7. Call `refresh_local_index` after local edits.
8. Call `reimport` only when cloud graph/insights should refresh.
9. Summarize changes, verification, blockers, skipped checks, and remaining risks.

## Implementation Scope

- CLI: keep command handlers focused on UX/orchestration; delegate durable logic to `packages/core`.
- MCP: keep tool contracts/responses clear, structured, and product-safe.
- Index/core: keep parser, symbol/import extraction, and local-index logic in the owning package.
- Agent-pack assets: keep target-specific generated assets aligned when shared workflow guidance changes.

## Verification Mapping

Choose verification by blast radius:

- Shared/type utility changes → `pnpm run build:shared`.
- Parser/index changes → `pnpm run build:code-index` or relevant tests.
- Core logic changes → `pnpm run build:core`.
- MCP/tool changes → `pnpm run build:mcp`.
- CLI/agent-pack changes → `pnpm run build:cli`.
- CLI test pattern exists or risk is high → `pnpm run test`.

Root build scripts already encode dependency order: `shared`/`code-index` → `core` → `mcp`/`cli`.
