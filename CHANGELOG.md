# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-06-10

### Added
- **Expanded language detection** in `code-index/language-utils.ts`:
  - `SOURCE_LANGUAGE_BY_EXTENSION`: 11 → 64 entries — now covers C, C++, C#, Go, Rust, Ruby, Swift, Lua, R, Scala, Groovy, Elixir, Erlang, Haskell, Clojure, F# + data/config/markup (JSON, YAML, TOML, XML, HTML, CSS, SCSS, Markdown, MDX, reStructuredText, SVG, CSV, TSV, SQL, GraphQL, Protocol Buffers) + shell/infra (Shell, Bash, Zsh, Fish, PowerShell, Batch, Dockerfile, Makefile, CMake) + other text (dotenv, INI, Config, Log, Diff, Patch)
  - `MIME_TYPE_BY_EXTENSION`: 9 → 54 entries — matching all 64 language extensions with appropriate MIME types including image types (PNG, JPEG, GIF, WebP, SVG)
- New `extensionFromFilename(fileName)` utility — extracts and normalizes extension from a full filename path
- New `normalizeExtension(input)` — accepts both filenames (`"file.ts"`) and extension strings (`"ts"`, `".TS"`), unifying two previous implementations
- Exported parser extension constants from `@codemap-ai/code-index`: `JS_TS_EXTENSIONS`, `DART_EXTENSIONS`, `PHP_EXTENSIONS`, `PYTHON_EXTENSIONS`, `JAVA_EXTENSIONS`, `KOTLIN_EXTENSIONS`
- Exported additional utilities: `isPathIgnored`, `normalizeRepositoryFilePath`

### Changed
- `file-discovery.ts` now uses `extensionFromFilename()` instead of `normalizeExtension()` for extracting extensions from filenames — clearer API boundary

## [1.2.0] - 2026-06-10

### Changed
- **Upgraded TypeScript to 6.0.3** across all 7 packages (`cli`, `code-index`, `core`, `mcp`, `shared`, `tool-types`, root)
  - Enables new TS 6.x language features (decorator metadata, `import.meta.resolve`, etc.)
  - `moduleResolution: "NodeNext"` now required (TS 6.x drops `"Node"` support)
- **Migrated `code-index` and `shared` packages to `module: "NodeNext"`** — last two holdouts from the CommonJS/Node era
  - Added explicit `.js` extensions to ~25 relative imports in `shared/src/` for Node16/NodeNext compliance
- Expanded `IGNORED_NAMES` in `code-index/file-discovery.ts`:
  - Added: `__pycache__`, `.mypy_cache`, `.pytest_cache` (Python cache directories)
  - Total ignore patterns now at 30
- Added `release:minor` and `release:major` scripts to root `package.json` — matches existing `release:patch` pattern
- Updated `release:patch` script to use `--no-git-checks` flag for pnpm workspace versioning

## [1.1.10] - 2026-06-10

### Added
- **FTS5-powered local code search** — `SQLiteIndexStore.search()` now uses FTS5 virtual tables (`files_fts`, `symbols_fts`, `exports_fts`) with BM25 ranking instead of `LIKE %term%` queries
  - 9 SQLite triggers auto-sync FTS index on INSERT/UPDATE/DELETE
  - Automatic backfill migration via `migrateFts()` when first launching MCP after upgrade
  - Prefix search support (e.g., `handle*` finds `handleFileUpdate`)
  - Substring matching across symbol names, file paths, and signatures
- Enhanced `.env` loader supports single quotes in values
- Auto-indexing now starts automatically when `codemap-mcp` server starts — local index is loaded and file watcher is enabled without requiring an explicit tool call
- Applies to all agent integrations that spawn `codemap-mcp` (Cursor, Copilot, Codex, CLI internal spawn)

### Changed
- Expanded `IGNORED_NAMES` filter in `code-index/file-discovery.ts`:
  - Added: `.continue`, `.github`, `.vscode`, `.cursor`, `.opencode`, `.windsurf`, `.zed`, `.gemini`, `.ideamrc`, `.pnpm-store`, `.dist`, `.next`, `.turbo`, `.cache`, `.vercel`, `tmp`, `temp`, `lib`
  - Reduced indexed files from ~75k → ~650 files per workspace
- File discovery skips symlinks everywhere to prevent duplicate indexing
- Improved error messages for FTS5 operations (graceful fallback to LIKE if FTS unavailable)

### Fixed
- TypeScript type fix in `sqlite-index-store.ts`: corrected `as Array<...>()` → `as Array<...>` (removed invalid cast syntax)
- Removed unused functions `includesAll()` and `scoreText()` — replaced by native FTS5 BM25 scoring
- Clean build output with no remaining hints or dead code warnings
- Fixed misleading "Execute phase completed without any tool calls" warning that appeared when users requested planning-only tasks (e.g., "lên plan", "make a plan")
- Added `executionMode` field to task classification to distinguish between `single`, `plan_only`, and `multi_execute` modes — warning now only appears for `multi_execute` tasks that don't use tools

### Performance
- Local search speedup: 10–100× faster than previous `LIKE %term%` approach for multi-term queries
- Symbol search precision improved via BM25 re-ranking (exact matches rank higher than substring matches)
- DB size reduction: from ~50MB → <1MB for typical monorepos due to aggressive path filtering
- `WatchEventHandler` no longer reindexes the changed file twice when it has dependents
- Dependent files are only reindexed when exported symbols actually change (not on every file save)
- File deletion no longer rebuilds the entire `SymbolDependencyGraph` from the store — uses incremental `removeFile()` instead

## [1.1.6] - 2026-06-08

### Changed
- Added a follow-up docs-only release entry for the latest CLI README cleanup and slash-command guidance

## [1.1.5] - 2026-06-08

### Changed
- Refreshed package README docs for `@codemap-ai/cli`, `@codemap-ai/mcp`, and the bundled agent-pack to match current install flows, supported commands, JSON-based `settings.json` gateway config, and Node.js 24+ requirements
- Removed stale agent-pack docs that referenced old `packages/mcp-server` paths, legacy `llm-gateway.json` config paths, invalid CLI commands, and token-based MCP auth examples

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
