# AGENTS.md

Guidance for Codex and other coding agents working in this repository.

This repo shares the same operating rules between agents. Use `CLAUDE.md` as the index, then follow the focused rule files under `.claude/rules/`.

## Must Read

- `.claude/rules/task-lifecycle.md` — default workflow from explore to final summary.
- `.claude/rules/mcp-first.md` — choose CodeMap MCP tools before raw file reads/grep.
- `.claude/rules/commands.md` — build/test/database commands.
- `.claude/rules/conventions.md` — backend/frontend coding conventions.
- `.claude/rules/database-schema.md` — schema-first DB workflow.
- `.claude/rules/tone-of-voice.md` — Vietnamese response style for this project.

## Default Workflow

1. Explore with MCP first:
   - Broad task → `explore_task`.
   - "Which files are related?" → `find_related_files`.
   - Narrow lookup → `search_codebase`.
   - Several candidate files → `get_files`.
   - Specific body/range → `get_file`.
2. Before editing repo files, apply `.claude/skills/confirm-before-edit/SKILL.md`: list files and plan, then wait for a clear OK.
3. Keep changes scoped and follow existing repo patterns.
4. Verify with the smallest sufficient build/test:
   - shared changes → `npm run build:shared`
   - API changes → `npm run build:api`
   - web changes → `npm run build:web`
   - tests when behavior risk warrants it
5. Check scope with `get_working_diff` or `git diff`.
6. Reimport with `trigger_reimport` + `wait_for_import` after meaningful code/index changes or when the user asks.
7. Final response should be concise, in friendly Vietnamese, with files changed and verification results.

## Project Notes

- Monorepo packages: `packages/api`, `packages/web`, `packages/shared`, `packages/mcp-server`.
- `shared` must build before `api` or `web`.
- Backend uses Fastify + Zod v4. Keep handlers thin and business logic in services.
- Web uses Next.js App Router + Zod v3. Default to Server Components unless client behavior is needed.
- Database changes are Drizzle schema-first; do not hand-write migrations unless explicitly requested.
