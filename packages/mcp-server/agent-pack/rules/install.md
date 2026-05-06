# Installing CodeMap Agent Pack

The Agent Pack is bundled with `@codemap/mcp-server`.

Use:

```bash
codemap-mcp init-agent-pack --target codex
codemap-mcp init-agent-pack --target claude
codemap-mcp init-agent-pack --target cursor
codemap-mcp init-agent-pack --target all
```

Add `--dry-run` to preview writes. Add `--force` to overwrite existing files.

The installer writes workflow rules and skills for the chosen agent harness. Conflicting files are backed up unless `--force` is used.
