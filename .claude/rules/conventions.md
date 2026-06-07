# Coding Conventions

## Package boundaries

- Keep CLI/user interaction code in `packages/cli`.
- Keep MCP tool contracts and transport-facing code in `packages/mcp`.
- Put reusable business logic in `packages/core` instead of duplicating it in CLI or MCP layers.
- Put parser, symbol, import, and local-index logic in `packages/code-index`.
- Share cross-package types/utilities through `packages/shared` or `packages/tool-types` when they are genuinely reused.

## TypeScript

- Follow the existing ESM TypeScript style.
- Prefer typed data flow over casts; do not hide type errors with broad `as any` unless there is no safer boundary.
- Keep public command/tool input validation at system boundaries with Zod or existing schema helpers.
- Avoid premature abstractions; keep small command handlers and tool adapters straightforward.

## CLI and MCP behavior

- Keep CLI commands focused on UX/orchestration; delegate durable logic to core packages.
- Keep MCP tool responses structured and machine-readable where possible.
- Do not expose internal runtime implementation names as product identity; user-facing copy should say CodeMap.
- Preserve backwards-compatible command names and packaged asset paths unless the user explicitly asks for a breaking change.

## Agent-pack content

- Agent-pack skill directories use the `codemap-*` prefix.
- Keep target-specific generated assets aligned when editing shared workflow guidance.
- Use generic repository guidance unless the file is intentionally scoped to a specific host tool.
- Do not mention generated or local-only files as required user setup unless the installer actually creates them.
