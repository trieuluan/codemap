<p align="center">
  <img src="docs/first-run-setup.gif" alt="CodeMap first-run setup demo" width="1100" />
</p>

<h1 align="center">CodeMap</h1>

<p align="center">
  <strong>AI coding agent CLI + MCP code-intelligence toolkit</strong><br />
  Help AI agents navigate your codebase — before they read files, edit code, or start generating changes blindly.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@codemap-ai/cli"><img src="https://img.shields.io/npm/v/@codemap-ai/cli?label=cli&color=4ade80" alt="CLI version" /></a>
  <a href="https://www.npmjs.com/package/@codemap-ai/mcp"><img src="https://img.shields.io/npm/v/@codemap-ai/mcp?label=mcp&color=60a5fa" alt="MCP version" /></a>
  <a href="https://github.com/trieuluan/codemap/actions/workflows/ci.yml"><img src="https://github.com/trieuluan/codemap/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-brightgreen" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-blue" alt="Node.js >= 24" />
</p>

---

## Install

```bash
npm install -g @codemap-ai/cli
```

The CLI includes a built-in MCP server — no separate install needed to get started.

Then bootstrap your project:

```bash
codemap init-agent-pack --target all
```

This installs skills, rules, and workflow guidance for Codex, Claude Code, Cursor, Gemini, OpenCode, and Copilot.

> **Need the MCP server standalone?** If you want to expose CodeMap tools to an editor like Claude Code or Cursor *without* running the CLI, install the MCP package separately:
> ```bash
> npm install -g @codemap-ai/mcp
> ```

---

## The problem CodeMap solves

Most AI coding tools are strong at **chat + code generation**. The hard part starts when they enter a real codebase:

| Without CodeMap | With CodeMap |
|---|---|
| Agent scans files linearly | MCP ranks the most relevant files and symbols first |
| Reads 10 unrelated files | `explore_task` returns a prioritized reading list |
| Grepping for keywords | Symbol-aware search with caller and import context |
| Edits one location, breaks three others | Blast-radius inspection before touching shared code |
| Inconsistent rules across Claude, Codex, Cursor | One Agent Pack workflow across all hosts |
| Claims done without verifying | Built-in verify gate: diff → build → index refresh |

**CodeMap is not just "a few extra MCP tools."** It combines `CLI + MCP + local code index + agent-pack workflow` into one operating model.

---

## How it works

```
┌──────────────────────────────────────────────────┐
│                    Your editor                   │
│   (Claude Code / Codex / Cursor / Gemini / …)    │
└───────────────────┬──────────────────────────────┘
                    │ MCP protocol
┌───────────────────▼──────────────────────────────┐
│               codemap-mcp server                 │
│  explore_task · search_codebase · find_related   │
│  get_file · symbol context · callers · diff      │
└───────────────────┬──────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────┐
│         Local SQLite index (no cloud needed)     │
│   files · symbols · imports · relationships      │
└──────────────────────────────────────────────────┘
```

The **Agent Pack** (installed via `codemap init-agent-pack`) teaches the agent to follow a consistent workflow:

1. **Orient** — which files and symbols are relevant?
2. **Read deliberately** — outlines first, then symbol bodies
3. **Edit safely** — inspect callers and blast radius before touching shared code
4. **Verify** — diff → build/test → refresh index before declaring done

---

## Quickstart

### Option A — Use the CodeMap CLI (recommended)

The CLI is a full interactive coding agent with the MCP server built in. Just install and run:

```bash
npm install -g @codemap-ai/cli
codemap
```

CodeMap starts, spins up its MCP server automatically, and you get an interactive AI coding session with full code-intelligence tools.

```bash
# Bootstrap agent workflow files for your editor of choice
codemap init-agent-pack --target claude   # or codex, cursor, gemini, opencode, copilot
```

---

### Option B — Use the standalone MCP server (editor integration)

If you prefer to keep using your existing editor (Claude Code, Cursor, Codex, etc.) and just add CodeMap as an MCP context provider:

```bash
npm install -g @codemap-ai/mcp
```

Then add `codemap-mcp` to your editor's MCP server config:

```json
{
  "mcpServers": {
    "codemap": {
      "command": "codemap-mcp"
    }
  }
}
```

Install the agent workflow files:

```bash
npx @codemap-ai/cli init-agent-pack --target claude   # or codex, cursor, gemini, opencode, copilot
```

---

### What the agent does differently

Once set up, the agent uses CodeMap tools before reading raw files:

```
> fix the authentication bug

→ explore_task("fix authentication bug")
→ returns: likelyFiles, symbols, entrypoints, risks
→ reads only the relevant 3 files instead of 30
→ inspects callers before patching shared code
→ verifies with diff + build before finishing
```

---

## MCP Tools

| Tool | Purpose |
|---|---|
| `explore_task` | Ranked files, symbols, risks, and entrypoints for any task |
| `search_codebase` | Keyword + semantic symbol/file/export search |
| `find_related_files` | Multi-signal related-file ranking from an anchor file or symbol |
| `get_file` | Outline or symbol-level reads (much cheaper than full-file reads) |
| `symbol` | Symbol body, callers, usages, and blast-radius impact |
| `diff` | Uncommitted working changes or ref-based diffs |
| `refresh_local_index` | Rebuild the local SQLite index after edits |

---

## Agent Pack targets

| Target | Command |
|---|---|
| All at once | `codemap init-agent-pack --target all` |
| Claude Code | `codemap init-agent-pack --target claude` |
| OpenAI Codex | `codemap init-agent-pack --target codex` |
| Cursor | `codemap init-agent-pack --target cursor` |
| Gemini | `codemap init-agent-pack --target gemini` |
| OpenCode | `codemap init-agent-pack --target opencode` |
| Copilot | `codemap init-agent-pack --target copilot` |

---

## Custom tools

Extend CodeMap with project-specific tools by adding `.tool.ts` files:

```typescript
// .codemap/tools/my-tool.tool.ts
import { defineTool } from "@codemap-ai/tool-types";
import { z } from "zod";

export default defineTool({
  name: "my-tool",
  description: "Does something useful for this project",
  parameters: z.object({ query: z.string() }),
  execute: async (input) => {
    return `Result: ${input.query}`;
  },
});
```

---

## Packages

| Package | npm | Description |
|---|---|---|
| `cli` | [`@codemap-ai/cli`](https://www.npmjs.com/package/@codemap-ai/cli) | Interactive coding agent CLI |
| `mcp` | [`@codemap-ai/mcp`](https://www.npmjs.com/package/@codemap-ai/mcp) | MCP server exposing CodeMap tools |
| `core` | [`@codemap-ai/core`](https://www.npmjs.com/package/@codemap-ai/core) | Shared runtime, config, and tool logic |
| `code-index` | [`@codemap-ai/code-index`](https://www.npmjs.com/package/@codemap-ai/code-index) | Local code parser and SQLite indexer |
| `shared` | [`@codemap-ai/shared`](https://www.npmjs.com/package/@codemap-ai/shared) | Shared TypeScript types and contracts |
| `tool-types` | [`@codemap-ai/tool-types`](https://www.npmjs.com/package/@codemap-ai/tool-types) | Type helpers for `.tool.ts` custom tools |

---

## Development

Requirements: Node.js 24+, pnpm

```bash
pnpm install

# dev mode
pnpm run dev:cli
pnpm run dev:mcp

# build
pnpm run build:cli
pnpm run build:mcp

# test
pnpm test
```

Full build order: `shared` → `code-index` → `core` → `mcp` / `cli`

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up the development environment, run tests, and submit pull requests.

Found a bug or have a feature idea? [Open an issue](https://github.com/trieuluan/codemap/issues).

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history and breaking changes.

---

## License

[MIT](LICENSE)
