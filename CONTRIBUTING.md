# Contributing to CodeMap

Thanks for your interest in contributing! This guide covers the open-source CodeMap CLI/MCP monorepo.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/trieuluan/codemap.git
cd codemap

# Install dependencies
pnpm install

# Run the CLI in development
pnpm run dev:cli

# Run the MCP server in development
pnpm run dev:mcp
```

## Project Structure

```text
packages/
├── cli/          # @codemap-ai/cli — interactive coding agent CLI
├── mcp/          # @codemap-ai/mcp — MCP server for code intelligence tools
├── core/         # @codemap-ai/core — shared runtime, config, and tool logic
├── code-index/   # @codemap-ai/code-index — local code parser/indexer
├── shared/       # @codemap-ai/shared — shared TypeScript types/contracts
└── tool-types/   # @codemap-ai/tool-types — types for custom .tool.ts tools
```

## Building

Build shared foundations before packages that depend on them:

```bash
pnpm run build:shared
pnpm run build:code-index
pnpm run build:core
pnpm run build:mcp
pnpm run build:cli
```

The higher-level build scripts chain their dependencies, so these are common shortcuts:

```bash
pnpm run build:mcp
pnpm run build:cli
```

## Testing

Run the root test command:

```bash
pnpm test
```

This currently runs the CLI test suite. For focused package checks, use package scripts directly, for example:

```bash
pnpm --filter @codemap-ai/cli run build
pnpm --filter @codemap-ai/mcp run build
```

## Code Style

- Use TypeScript and keep types explicit at package boundaries.
- Follow existing patterns in the package you are changing.
- Keep changes scoped; avoid broad refactors unless they are part of the task.
- Prefer simple, readable code over premature abstractions.
- Do not add compatibility shims or dead code.

## Custom Tools

You can extend CodeMap with custom tools by dropping `.tool.ts` files into `.codemap/tools/`:

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

See `@codemap-ai/tool-types` for the full type definition.

## Pull Requests

1. Fork the repo and create a branch from `master`.
2. Make your changes.
3. Run the relevant build/test commands.
4. Submit a PR with a clear summary and verification notes.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
