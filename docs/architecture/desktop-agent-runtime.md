# Desktop Agent Runtime

## Status

Accepted.

## Context

CodeMap supports a terminal client and an Electron desktop client. Both clients
must run the same agent behavior without exposing Node.js, Mastra, filesystem
access, or credentials to the desktop renderer.

## Decision

The dependency direction is:

```text
desktop renderer -> @codemap-ai/core/agent/contracts
CLI              -> @codemap-ai/runtime-node -> @codemap-ai/core
desktop utility  -> @codemap-ai/runtime-node -> @codemap-ai/core
```

`@codemap-ai/core` owns pure contracts, session state, prompt composition,
permission rules, and event reduction. The browser-safe exports live under
`@codemap-ai/core/agent/contracts` and `@codemap-ai/core/agent/session`.

`@codemap-ai/runtime-node` owns the Mastra harness, MCP children, filesystem
access, settings, hooks, custom tools, persistence, and workspace hydration.
It exposes `createNodeAgentSession()` as the shared entry point for Node hosts.

The CLI translates `AgentSessionEvent` values into terminal state. Electron
creates one utility process for each workspace window. The utility process owns
the Node runtime and sends validated events to the main process. The renderer
can only use the narrow API exposed by the context-isolated preload bridge.

Account and settings data remain in the existing CodeMap configuration and
Mastra storage locations. Secrets never cross renderer IPC.

## Consequences

- CLI and desktop share agent behavior and storage conventions.
- Renderer code remains browser-safe and can be tested without Node shims.
- A utility process crash disconnects one workspace instead of the whole app.
- IPC contracts require explicit schemas and request completion semantics.
- New Node capabilities belong in `runtime-node`, not in a client adapter.
