# CodeMap Agent Pack

CodeMap Agent Pack is a workflow layer for AI coding agents. It teaches agents to use CodeMap MCP as a context engine before reading raw files.

It includes skills, rules, agent roles, plugin metadata, and installer templates for Codex, Claude, and Cursor.

Install locally with:

```bash
codemap-mcp init-agent-pack --target all
```

Print the local plugin root path:

```bash
codemap-mcp agent-pack-path
```

Register a local Codex-style marketplace entry:

```bash
codemap-mcp init-agent-pack --target marketplace --plugin-path ./packages/mcp-server
```

Official `/plugin install codemap-agent-pack` requires later marketplace publishing. This pack provides the local/plugin-compatible assets first.

