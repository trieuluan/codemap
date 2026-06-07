# Dev Commands

Run commands from the repository root unless noted otherwise. This workspace uses `pnpm` workspaces.

## Install

```bash
pnpm install
```

## Development

```bash
pnpm run dev:cli      # run the CodeMap CLI from source
pnpm run start:cli    # run the built CLI
pnpm run dev:mcp      # run the CodeMap MCP server from source
pnpm run start:mcp    # run the built MCP server
```

## Build

```bash
pnpm run build:shared      # shared types/utilities
pnpm run build:code-index  # local parser/index package
pnpm run build:core        # shared + code-index + core
pnpm run build:mcp         # core + MCP package
pnpm run build:cli         # core + CLI package
```

Build `core` before `mcp` or `cli`; the root scripts already encode the required order.

## Test

```bash
pnpm run test              # CLI test suite
pnpm --filter @codemap-ai/cli run build:tsc
pnpm --filter @codemap-ai/mcp run build:tsc
```

Use the smallest relevant build/test for the files changed. For cross-package workflow or agent-pack changes, prefer at least `pnpm run build:cli`.

## Agent pack smoke checks

```bash
pnpm run dev:cli -- agent-pack-path
pnpm run dev:cli -- init-agent-pack --target all --root /tmp/codemap-agent-pack-smoke --dry-run
pnpm run dev:cli -- init-agent-pack --target codex --dry-run
```

Use a temporary `--root` for smoke installs so generated agent files do not pollute this repository.

## Release helpers

```bash
pnpm run version:patch
pnpm run release:patch
```

Release commands edit versions, create commits, and tags. Only run them when the user explicitly asks for a release.
