import type { BaseCommandContext } from ".././command-context.js";

export function runHelp(ctx: BaseCommandContext): void {
  console.log(`CodeMap ${ctx.version}

Usage:
  codemap                     Enter interactive chat (default)
  codemap help                Show this help

Chat:
  codemap chat                Enter interactive chat (explicit)
  codemap ask "<prompt>"      Run a single prompt and exit
  codemap models              List default model and available gateway models
  codemap doctor              Diagnose workspace, project, gateway, and model configuration

Auth:
  codemap login               Authenticate with CodeMap (opens browser)
  codemap logout              Clear stored credentials
  codemap whoami              Show current authenticated user

Agent pack (editor integration):
  codemap init-agent-pack     Install CodeMap agent rules into an editor
                              --target <editor>  claude | cursor | codex | gemini | opencode | copilot | all
                              --root <dir>       Workspace root (default: cwd)
                              --dry-run          Preview without writing
  codemap doctor-agent-pack   Check agent pack installation health
                              --target <editor>  Editor to check (default: auto-detect)
                              --root <dir>       Workspace root
  codemap agent-pack-path     Print the agent pack plugin root path
  codemap clean-agent-pack-backups   Remove backup files left by agent pack upgrades
                              --root <dir>   Workspace root
                              --dry-run      Preview without deleting

Gateway config:
  CODEMAP_LLM_GATEWAY_BASE_URL         OpenAI-compatible base URL (default: http://localhost:4000/v1)
  CODEMAP_LLM_GATEWAY_API_KEY          Optional bearer token
  CODEMAP_LLM_GATEWAY_DEFAULT_PROFILE  Default profile: coder | planner | reviewer
  CODEMAP_LLM_GATEWAY_CODER_MODEL      Model for coder profile
  CODEMAP_LLM_GATEWAY_PLANNER_MODEL    Model for planner profile
  CODEMAP_LLM_GATEWAY_REVIEWER_MODEL   Model for reviewer profile

Config files:
  .codemap/settings.json      Project-level settings
  ~/.codemap/settings.json    User-level settings`);
}

