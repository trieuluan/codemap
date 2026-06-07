# Architecture Overview

## Monorepo packages

- `packages/cli` — CodeMap CLI entrypoint and AI coding agent runtime integration.
- `packages/mcp` — CodeMap MCP server for IDE/agent integrations.
- `packages/core` — shared project, indexing, workflow, and MCP business logic.
- `packages/code-index` — local source parser/indexer and SQLite-backed code intelligence.
- `packages/shared` — shared TypeScript types/utilities used by package internals.
- `packages/tool-types` — shared MCP/tool schema type definitions.

Core dependency order: build `shared` and `code-index` before `core`; build `core` before `mcp` or `cli`.

## CLI — `packages/cli`

The CLI is published as the `codemap` binary.

Key areas:

- `src/index.ts` — CLI entrypoint.
- `src/commands/` — top-level user commands such as agent-pack install and project helpers.
- `src/runtime/` and `src/agents/` — AI agent runtime integration and role definitions.
- `agent-pack/` — installable rules, skills, templates, and agent-specific configuration assets.
- `.claude-plugin`, `.codex-plugin`, `.cursor-plugin` — packaged plugin metadata/assets for supported coding agents.

## MCP server — `packages/mcp`

The MCP package is published as the `codemap-mcp` binary.

Responsibilities:

- Expose CodeMap MCP tools over the configured MCP transport.
- Bridge agent tool calls to local index/core services.
- Provide project discovery, code search, symbol context, related-file lookup, diff, and index refresh capabilities.

## Core and indexing packages

- `packages/core` owns reusable logic that should not be tied to CLI UI concerns.
- `packages/code-index` owns parsing, symbol/import extraction, local index persistence, and search primitives.
- Keep package boundaries clean: CLI should orchestrate UX, MCP should expose tool contracts, core/index packages should hold reusable logic.

## Agent pack assets

Agent-pack content is duplicated across target-specific directories so different coding tools can install equivalent CodeMap workflow guidance.

Key areas:

- `packages/cli/agent-pack/` — source assets bundled with the CLI package.
- `.codex/skills/codemap-*` and `.claude/skills/codemap-*` — installed skill directories.
- `.cursor/rules/*` — Cursor rule assets.
- `AGENTS.md` and `CLAUDE.md` — root repository instructions for supported agents.

When updating workflow guidance:

- Keep `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*`, `.codex/*`, and `packages/cli/agent-pack/**` consistent when the same rule applies cross-agent.
- Use `codemap-*` skill directory names for packaged skills.
- Prefer generic CodeMap CLI/MCP language unless a file intentionally documents a host-specific integration.
- Smoke-test installer behavior with `init-agent-pack --dry-run` when packaged assets or installer code change.
