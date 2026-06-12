// Agent runtime types and shared abstractions for CLI and desktop apps.
// lifecycle.ts stays in @codemap-ai/cli — it depends on CLI-only modules
// (tool-approval-policy, custom tools, hooks, CLI settings).

export * from "./types.js";
export * from "./agent-loop.js";
export * from "./event-bus.js";
export * from "./config/index.js";
export * from "./loop/index.js";
export * from "./mcp/index.js";
export * from "./contracts/index.js";
export * from "./session/index.js";
export * from "./prompt.js";
export * from "./permissions.js";
