# CodeMap Agent Pack

CodeMap Agent Pack is a workflow layer for AI coding agents. It teaches agents to use CodeMap MCP as a context engine before reading raw files.

It includes skills, rules, agent roles, plugin metadata, and installer templates for Codex, Claude, Cursor, Gemini, OpenCode, and GitHub Copilot CLI style workflows.

For broad tasks, agents should choose the narrowest CodeMap context tool first: `explore_task` when files are unclear, `search_codebase` for known names, `find_related_files` for related-file questions, or `get_file` for known paths.

After edits, agents should run the smallest relevant build or test, inspect the working diff, refresh the local index when needed, and report verification results before finishing.

Install locally with:

```bash
codemap init-agent-pack --target all
```

Install one target:

```bash
codemap init-agent-pack --target codex
codemap init-agent-pack --target claude
codemap init-agent-pack --target cursor
codemap init-agent-pack --target gemini
codemap init-agent-pack --target opencode
codemap init-agent-pack --target copilot
```

Print the local plugin root path:

```bash
codemap agent-pack-path
```

Register a local Codex-style marketplace entry:

```bash
codemap init-agent-pack --target marketplace --plugin-path ./packages/mcp-server
```

Preview or test in another directory:

```bash
codemap init-agent-pack --target all --root /path/to/project --dry-run
```

Official `/plugin install codemap-agent-pack` requires later marketplace publishing. This pack provides the local/plugin-compatible assets first.

