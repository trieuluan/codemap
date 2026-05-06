# CodeMap Agent Pack

CodeMap Agent Pack is a workflow layer for AI coding agents. It teaches agents to use CodeMap MCP as a context engine before reading raw files.

It includes skills, rules, agent roles, plugin metadata, and installer templates for Codex, Claude, Cursor, Gemini, OpenCode, and GitHub Copilot CLI style workflows.

Install locally with:

```bash
codemap-mcp init-agent-pack --target all
```

Install one target:

```bash
codemap-mcp init-agent-pack --target codex
codemap-mcp init-agent-pack --target claude
codemap-mcp init-agent-pack --target cursor
codemap-mcp init-agent-pack --target gemini
codemap-mcp init-agent-pack --target opencode
codemap-mcp init-agent-pack --target copilot
```

Print the local plugin root path:

```bash
codemap-mcp agent-pack-path
```

Register a local Codex-style marketplace entry:

```bash
codemap-mcp init-agent-pack --target marketplace --plugin-path ./packages/mcp-server
```

Preview or test in another directory:

```bash
codemap-mcp init-agent-pack --target all --root /path/to/project --dry-run
```

Official `/plugin install codemap-agent-pack` requires later marketplace publishing. This pack provides the local/plugin-compatible assets first.

