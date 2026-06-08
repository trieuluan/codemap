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

### Chat & Gateway

```bash
codemap                    # Interactive chat (default)
codemap chat               # Interactive chat (explicit)
codemap ask "explain X"    # Single prompt, exit
codemap models             # List available models
codemap doctor             # Diagnose workspace, project, gateway, and model config
```

### Agent Pack (Editor Integration)

```bash
codemap init-agent-pack      # Install CodeMap agent rules into an editor
  --target <editor>          # claude | cursor | codex | gemini | opencode | copilot | all
  --root <dir>               # Workspace root (default: cwd)
  --dry-run                  # Preview without writing

codemap doctor-agent-pack    # Check agent pack installation health
  --target <editor>          # Editor to check (default: auto-detect)
  --root <dir>               # Workspace root

codemap agent-pack-path      # Print the agent pack plugin root path

codemap clean-agent-pack-backups  # Remove backup files left by upgrades
  --root <dir>               # Workspace root
  --dry-run                  # Preview without deleting
```

## Gateway Configuration

CodeMap uses an LLM gateway for chat and agent features. Configure via environment variables or config files:

```bash
CODEMAP_LLM_GATEWAY_BASE_URL=http://localhost:4000/v1
CODEMAP_LLM_GATEWAY_API_KEY=your-key
CODEMAP_LLM_GATEWAY_DEFAULT_PROFILE=coder
CODEMAP_LLM_GATEWAY_CODER_MODEL=model-name
CODEMAP_LLM_GATEWAY_PLANNER_MODEL=model-name
CODEMAP_LLM_GATEWAY_REVIEWER_MODEL=model-name
```

Or create a config file at `.codemap/llm-gateway.json` (project) or `~/.codemap/llm-gateway.json` (user).

## Requirements

- Node.js 24+
- Git (for repository features)

## License

MIT
