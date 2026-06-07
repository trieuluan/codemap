# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.4] - 2026-06-07

### Added
- Working memory toggle via `/memory on|off` slash command
- Respect `agent.workingMemory` setting from config instead of hardcoding

### Fixed
- Improved error messages with actionable guidance for working memory state

## [1.1.3] - 2026-06-07

### Fixed
- Message renderer preserves tilde-fenced diff blocks containing markdown code fences (backtick fences inside diff context no longer break preview layout)
- Diff preview no longer double-wraps fence lines — fixes incorrect Shiki syntax highlighting in TypeScript diffs
- `renderUnifiedDiff` exported from `text.ts` for direct use by renderer (bypasses markdown parser interference)

## [1.1.2] - 2026-06-07

### Fixed
- Harden Mastra cleanup — avoid failures when local database or spans table is absent
- Harness runner imports `AgentLoopResult` value correctly
- Prevent invalid recall cursor placeholders from wasting agent turns

## [1.1.1] - 2026-06-07

### Fixed
- Suppress Node.js experimental feature warnings in CLI binary and dev scripts

## [1.1.0] - 2026-06-07

### Changed
- Package scope renamed from `@codemap/*` to `@codemap-ai/*` across all packages
- Packages `api` and `web` moved to private `codemap-platform` repo — public repo now contains CLI/MCP/core packages only
- `tsconfig.base.json` updated: `module: nodenext`, `moduleResolution: nodenext`, `esModuleInterop`, `allowSyntheticDefaultImports`, `skipLibCheck: true`

### Added
- MIT `LICENSE` file
- `CHANGELOG.md` (this file)
- `CONTRIBUTING.md`
- GitHub Actions CI (`ci.yml`) and publish (`publish.yml`) workflows
- `NOTICE` file with Apache-2.0 attribution for Mastra packages

### Removed
- `packages/api` and `packages/web` (moved to platform repo)
- `Dockerfile.api`, `Dockerfile.web`, `compose*.yml`, `Makefile`, `DEPLOY.md`
- `.devcontainer/` (moved to platform repo)

## [0.2.0] - 2026-06-07

### Added
- `.tool.ts` custom tool support — drop TypeScript files into `.codemap/tools/` for auto-discovered tools
- `@codemap-ai/tool-types` package for typed custom tool authoring with optional Zod
- Live preview snippet fallback when virtual document buffer match fails
- `buildSnippetEditPreview()` generates Shiki-ready diffs from `old_string`/`new_string` args

### Changed
- Custom tools now support `.tool.ts` format only (`.tool.json` removed)
- `/tools init` and `/tools add` generate `.tool.ts` templates
- Skills synthesis removed from Convention Synthesizer — Mastra handles skills natively
- Harness runtime split into `harness/lifecycle.ts`, `harness/threads.ts`, `introspection/`
- Agent core split into `agent/loop/`, `agent/prompt/`, `agent/utils/`
- API project controller refactored with shared `controller.helpers.ts`

### Removed
- `.tool.json` custom tool format (`CustomToolDescriptor`, `CustomToolKind`, `readDescriptor()`, etc.)
- Skills synthesis from Convention Synthesizer (Mastra Skill Tools handle this)
- Dead exports: `formatToolUiResult`, `previewEditWithLineInfo`, `isMutatingApprovalTool`
- `MUTATING_TOOL_PATTERN` constant

### Fixed
- Virtual document buffer stale-cache retry for repeated same-file edits
- Edit preview now shows Shiki diff instead of raw JSON when VDB match fails
- `parsePatch` try-catch prevents malformed diffs from crashing markdown renderer

## [0.1.9] - 2025-06-01

### Added
- Initial release as `@codemap-ai/cli`
- Multi-provider LLM support (11 providers)
- Custom tool support via `.tool.json`
- MCP integration
- Plan mode with approval workflow
- Session restore with edit preview caching
