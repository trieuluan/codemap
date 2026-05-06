# Installing CodeMap Agent Pack

The Agent Pack is bundled with `@codemap/mcp-server`.

Use:

```bash
codemap-mcp init-agent-pack --target codex
codemap-mcp init-agent-pack --target claude
codemap-mcp init-agent-pack --target cursor
codemap-mcp init-agent-pack --target gemini
codemap-mcp init-agent-pack --target opencode
codemap-mcp init-agent-pack --target copilot
codemap-mcp init-agent-pack --target all
codemap-mcp init-agent-pack --target marketplace --plugin-path ./packages/mcp-server
```

Add `--dry-run` to preview writes. Add `--force` to overwrite existing files.
Add `--root <path>` to install into a specific project directory for testing or scripted setup.

The installer writes workflow rules and skills for the chosen agent harness. Conflicting files are backed up unless `--force` is used.

Codex installs `AGENTS.md`, `.codex/codemap-agent-pack.md`, and CodeMap skills under `.codex/skills/codemap-*`.
Claude installs `CLAUDE.md`, `.claude/rules/codemap-*`, and CodeMap skills under `.claude/skills/codemap-*`.

Use `codemap-mcp agent-pack-path` to print the local plugin root path for Codex-style plugin registration.
