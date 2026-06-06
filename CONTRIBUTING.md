# Contributing to CodeMap

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/trieuluan/codemap.git
cd codemap

# Install dependencies
npm install

# Build shared packages first (required)
npm run build:shared

# Start development
npm run dev        # API + Web
npm run dev:api    # API only
npm run dev:web    # Web only
```

## Project Structure

```
packages/
├── cli/          # @codemap-ai/cli — CLI agent (main product)
├── core/         # @codemap-ai/core — shared library, index store, config
├── mcp/          # @codemap-ai/mcp — MCP server for code intelligence
├── code-index/   # @codemap-ai/code-index — SQLite-based code indexing
├── tool-types/   # @codemap-ai/tool-types — types for custom .tool.ts tools
├── shared/       # @codemap-ai/shared — shared TypeScript types
├── api/          # Fastify backend (private)
└── web/          # Next.js frontend (private)
```

## Building

```bash
npm run build:shared  # Must run first
npm run build:api     # Build API package
npm run build:web     # Build Web package

# CLI build
cd packages/cli && npm run build
```

## Testing

```bash
# CLI tests
cd packages/cli && node --import tsx --test src/**/*.test.ts

# API tests
npm run test:api
```

## Code Style

- TypeScript strict mode
- Follow existing patterns in the codebase
- Keep route handlers thin — business logic in services
- Default to Server Components in web; add `"use client"` only when needed
- Use `cn()` for Tailwind class merging

## Custom Tools

You can extend CodeMap with custom tools by dropping `.tool.ts` files into `.codemap/tools/`:

```typescript
import { defineTool } from "@codemap-ai/tool-types";
import { z } from "zod";

export default defineTool({
  name: "my-tool",
  description: "Does something useful",
  parameters: z.object({ query: z.string() }),
  execute: async (input, ctx) => {
    return `Result: ${input.query}`;
  },
});
```

See `@codemap-ai/tool-types` for the full type definition.

## Pull Requests

1. Fork the repo and create a branch from `master`
2. Make your changes
3. Run tests to verify
4. Submit a PR with a clear description

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
