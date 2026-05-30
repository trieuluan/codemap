# @codemap-ai/cli

AI-powered code intelligence and coding agent CLI. Provides an MCP server for code exploration, symbol analysis, and refactoring — plus an interactive chat agent powered by LLM gateways.

## Quick Start

```bash
# Run directly with npx (no install needed)
npx -y @codemap-ai/cli

# Or install globally
npm install -g @codemap-ai/cli
codemap
```

## MCP Server Setup

CodeMap runs as an MCP (Model Context Protocol) server that plugs into AI coding agents. Pick your editor:

### Claude Code

```bash
claude mcp add codemap-mcp -- npx -y @codemap-ai/cli
```

### Cursor

Create or edit `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "codemap-mcp": {
      "command": "npx",
      "args": ["-y", "@codemap-ai/cli"]
    }
  }
}
```

Then restart Cursor.

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.codemap]
command = "npx"
args = ["-y", "@codemap-ai/cli"]
```

### Gemini CLI

Edit `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "codemap-mcp": {
      "command": "npx",
      "args": ["-y", "@codemap-ai/cli"]
    }
  }
}
```

### GitHub Copilot (VS Code)

Create or edit `.vscode/mcp.json`:

```json
{
  "servers": {
    "codemap-mcp": {
      "command": "npx",
      "args": ["-y", "@codemap-ai/cli"]
    }
  }
}
```

Then reload VS Code.

### OpenCode

Edit `opencode.json` in your project root:

```json
{
  "mcp": {
    "codemap-mcp": {
      "command": "npx",
      "args": ["-y", "@codemap-ai/cli"],
      "enabled": true
    }
  }
}
```

## Authentication

```bash
codemap login      # Opens browser for CodeMap auth
codemap whoami     # Check current user
codemap logout     # Clear credentials
```

## CLI Commands

### Chat & Gateway

```bash
codemap                    # Interactive chat (default)
codemap ask "explain X"    # Single prompt, exit
codemap route "task"       # Show which model handles a task
codemap models             # List available models
codemap doctor             # Diagnose gateway config
codemap init-gateway       # Create gateway config
```

### Workspace

```bash
codemap status             # Git, index, auth, project status
codemap local-index        # Build/update local code index
codemap local-index --force  # Full rebuild
```

### Agent Pack (Editor Integration)

```bash
codemap init-agent-pack --target claude   # Install rules for Claude Code
codemap init-agent-pack --target all      # Install for all supported editors
codemap doctor-agent-pack                 # Check installation health
codemap onboarding --target cursor        # Print setup guide
```

## MCP Tools

When running as an MCP server, CodeMap exposes these tools to your AI agent:

| Tool | Description |
|---|---|
| `explore_task` | Broad task exploration — returns likely files, entrypoints, symbols, risks |
| `search_codebase` | Find files, symbols, exports by keyword or semantic query |
| `get_file` | Read file with outline, symbol bodies, or blast radius analysis |
| `symbol` | Inspect a symbol — context, usages, callers, similar |
| `find_related_files` | Multi-signal ranking of files related to a query or file |
| `get_project_map` | Browse file tree |
| `get_project_insights` | Codebase health: orphans, cycles, top files by dependency |
| `diff` | Git diff — working tree or between refs |
| `move_symbols` | Move symbols between files, auto-update imports |
| `rename_symbol` | Rename symbol codebase-wide |
| `reimport` | Trigger cloud re-indexing |
| `refresh_local_index` | Refresh local SQLite index |
| `web_search` / `web_fetch` | Search and fetch web documentation |

## Gateway Configuration

CodeMap uses an LLM gateway for chat and agent features. Configure via environment variables or config files:

```bash
CODEMAP_LLM_GATEWAY_BASE_URL=http://localhost:4000/v1
CODEMAP_LLM_GATEWAY_API_KEY=your-key
CODEMAP_LLM_GATEWAY_DEFAULT_PROFILE=coder
```

Or create a config file at `.codemap/llm-gateway.json` (project) or `~/.codemap/llm-gateway.json` (user).

## Requirements

- Node.js 18+
- Git (for repository features)

## License

MIT
