# CodeMap

CodeMap is an AI-powered coding agent CLI and MCP code-intelligence toolkit. It helps agents and developers explore repositories, understand symbols and dependencies, edit code safely, and verify changes with local indexing support.

## Packages

```text
packages/
├── cli/          # @codemap-ai/cli — interactive coding agent CLI
├── mcp/          # @codemap-ai/mcp — MCP server for CodeMap tools
├── core/         # @codemap-ai/core — shared runtime, config, and tool logic
├── code-index/   # @codemap-ai/code-index — local code parser/indexer
├── shared/       # @codemap-ai/shared — shared TypeScript types/contracts
└── tool-types/   # @codemap-ai/tool-types — custom .tool.ts type helpers
```

## What CodeMap Provides

- CLI coding-agent experience via the `codemap` binary
- MCP server integration via the `codemap-mcp` binary
- local repository indexing for file, symbol, import, and relationship lookup
- CodeMap Agent Pack installation for supported coding agents
- custom tool support through `.codemap/tools/*.tool.ts`

## Requirements

- Node.js 24+
- pnpm

Install dependencies from the repository root:

```bash
pnpm install
```

## Development

Run the CLI in development mode:

```bash
pnpm run dev:cli
```

Run the MCP server in development mode:

```bash
pnpm run dev:mcp
```

Run built packages:

```bash
pnpm run start:cli
pnpm run start:mcp
```

## Build

Build shared foundations first, then dependents:

```bash
pnpm run build:shared
pnpm run build:code-index
pnpm run build:core
pnpm run build:mcp
pnpm run build:cli
```

`build:core`, `build:mcp`, and `build:cli` already chain their required dependencies, so this is usually enough for a full product build:

```bash
pnpm run build:mcp
pnpm run build:cli
```

## Test

Run the root test command:

```bash
pnpm test
```

This currently runs the CLI test suite.

## Using the CLI

After building, run:

```bash
pnpm run start:cli -- --help
```

The published CLI exposes the `codemap` binary:

```bash
codemap --help
```

## MCP Server

After building, run:

```bash
pnpm run start:mcp
```

The published MCP package exposes the `codemap-mcp` binary.

## Agent Pack

CodeMap can install agent instructions, skills, and rules for supported coding agents:

```bash
codemap init-agent-pack --target all
```

Install for a specific agent:

```bash
codemap init-agent-pack --target codex
codemap init-agent-pack --target claude
codemap init-agent-pack --target cursor
codemap init-agent-pack --target gemini
codemap init-agent-pack --target opencode
codemap init-agent-pack --target copilot
```

## Custom Tools

Add custom tools by creating `.tool.ts` files under `.codemap/tools/`:

```typescript
import { defineTool } from "@codemap-ai/tool-types";
import { z } from "zod";

export default defineTool({
  name: "my-tool",
  description: "Does something useful",
  parameters: z.object({ query: z.string() }),
  execute: async (input) => {
    return `Result: ${input.query}`;
  },
});
```

## License

MIT
