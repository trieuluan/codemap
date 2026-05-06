# CLAUDE.md

Use CodeMap MCP-first workflow for this repository.

Must read:

- `.claude/rules/codemap-mcp-first.md`
- `.claude/rules/codemap-task-lifecycle.md`
- `.claude/rules/commands.md` | Dev, database, build, and Docker commands |
- `.claude/rules/architecture.md` | Monorepo structure, backend modules, DB schema, frontend layout |
- `.claude/rules/conventions.md` | Coding conventions (Zod versions, server vs client components, thin handlers) |
- `.claude/rules/ui-routes.md` | All app routes + global shell design language |
- `.claude/rules/ui-map.md` | Map feature layout, 3-column explorer, component file reference |
- `.claude/rules/tone-of-voice.md` | Giọng văn khi Claude phản hồi: tiếng Việt thân thiện, dịch thoát ý, giữ nguyên jargon IT |

Relevant skills live under `.claude/skills/codemap-*`:

- `codemap-brainstorming` — design-first workflow with hard gate before implementation
- `codemap-test-driven-development` — RED → GREEN → REFACTOR using CodeMap tools

When a CodeMap MCP tool returns ranked files, symbol context, or next steps, read the summary and ranking signals before opening raw files.
