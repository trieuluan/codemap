# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
