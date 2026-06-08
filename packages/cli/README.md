# @codemap-ai/cli

AI-powered coding agent CLI. Interactive chat agent powered by LLM gateways, with code exploration, symbol analysis, and refactoring capabilities.

## Quick Start

```bash
# Run directly with npx (no install needed)
npx -y @codemap-ai/cli

# Or install globally
npm install -g @codemap-ai/cli
codemap
```

## Authentication

```bash
codemap login      # Opens browser for CodeMap auth
codemap whoami     # Check current user
codemap logout     # Clear credentials
```

## CLI Commands

The currently supported top-level commands are:

```bash
codemap                     # Interactive chat (default)
codemap chat                # Interactive chat (explicit)
codemap help                # Show CLI help
codemap version             # Show CLI version
codemap --version           # Show CLI version
codemap models              # Show default model and list models from the gateway
codemap doctor              # Diagnose workspace and gateway configuration
codemap init-agent-pack     # Install CodeMap agent-pack files into a workspace
codemap doctor-agent-pack   # Check agent-pack installation health
codemap agent-pack-path     # Print the packaged agent-pack plugin root
codemap clean-agent-pack-backups  # Remove backup files left by agent-pack upgrades
```

### Agent Pack flags

```bash
codemap init-agent-pack --target <editor> [--root <dir>] [--dry-run]
# targets: claude | cursor | codex | gemini | opencode | copilot | marketplace | all

codemap doctor-agent-pack [--target <editor>] [--root <dir>]

codemap clean-agent-pack-backups [--root <dir>] [--dry-run]
```

## Interactive slash commands

Inside `codemap` chat, you can run slash commands like:

```text
/help           Show available slash commands
/status         Show model, session, and workspace status
/models         Switch the active model
/diff           Show working diff
/sessions       List saved chat threads
/memory         Show working memory status
/memory on      Enable working memory for this project
/memory off     Disable working memory for this project
/login          Log in to CodeMap
/logout         Log out and clear stored credentials
/mcp            Manage MCP servers
/tools          List, init, add, or reload custom tools
/hooks          Manage lifecycle hooks
/exit           Exit chat
```

You can also type `@` in chat to autocomplete file paths for context.

## Gateway Configuration

CodeMap reads gateway settings from `.codemap/settings.json` (project) or `~/.codemap/settings.json` (user). Environment variables can override those values when needed.

Example `settings.json`:

```json
{
  "gateway": {
    "provider": "9router",
    "baseUrl": "http://localhost:4000/v1",
    "defaultModel": "coder",
    "modeDefaults": {
      "build": "coder",
      "plan": "gpt-5",
      "fast": "gpt-5-mini"
    }
  }
}
```


## Requirements

- Node.js 24+
- Git (for repository features)

## License

MIT
