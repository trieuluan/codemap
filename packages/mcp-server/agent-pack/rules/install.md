# Installing CodeMap Agent Pack

The Agent Pack is bundled with `@codemap/mcp-server`.

Use:

```bash
codemap init-agent-pack --target codex
codemap init-agent-pack --target claude
codemap init-agent-pack --target cursor
codemap init-agent-pack --target gemini
codemap init-agent-pack --target opencode
codemap init-agent-pack --target copilot
codemap init-agent-pack --target all
codemap init-agent-pack --target marketplace --plugin-path ./packages/mcp-server
```

Add `--dry-run` to preview writes. Add `--force` to overwrite existing files.
Add `--root <path>` to install into a specific project directory for testing or scripted setup.

After install, verify the harness files and skills:

```bash
codemap doctor-agent-pack --target auto
```

The installer writes workflow rules and skills for the chosen agent harness. Conflicting files are backed up unless `--force` is used.

Codex installs `AGENTS.md`, `.codex/codemap-agent-pack.md`, and CodeMap skills under `.codex/skills/codemap-*`.
Claude installs `CLAUDE.md`, `.claude/rules/codemap-*`, and CodeMap skills under `.claude/skills/codemap-*`.
Cursor installs `.cursor/rules/codemap.mdc` with MCP-first, lifecycle, and workflow-skill routing guidance.

For broad implementation/debug/review/refactor/test/research work, installed guidance tells agents to use CodeMap context tools before editing and to follow the relevant skills, hard gates, artifact templates, and verification checks.

Use `codemap agent-pack-path` to print the local plugin root path for Codex-style plugin registration.
