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
codemap route "task"       # Show which model handles a task
codemap models             # List available models
codemap doctor             # Diagnose gateway config
codemap init-gateway       # Create gateway config file (--project | --global)
                           #   --base-url <url>   Override gateway base URL
                           #   --force            Overwrite existing config
```

### Workspace

```bash
codemap status               # Git, index, auth, project status
codemap local-index          # Build/update local code index
  --force                    # Full rebuild
  --status                   # Show index info without rebuilding
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

codemap onboarding           # Print setup guide for an editor
  --target <editor>          # claude | cursor | codex | gemini | opencode | copilot | all
```

### Claude Code Hooks

These are called automatically by Claude Code hook config, not by hand:

```bash
codemap session-hint         # Emit index status hint on session start
codemap pre-edit             # Emit blast radius hint before a file edit
codemap pre-read             # Emit index hint before a file read
codemap pre-bash             # Emit search hint before a bash command
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

- Node.js 22+
- Git (for repository features)

## License

MIT
