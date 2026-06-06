/**
 * @codemap-ai/tool-types
 *
 * TypeScript types for CodeMap custom tools.
 *
 * Drop a `.tool.ts` file into `.codemap/tools/` and export a tool definition:
 *
 * ```ts
 * import { defineTool } from "@codemap-ai/tool-types";
 *
 * export default defineTool({
 *   name: "deploy",
 *   description: "Deploy to staging",
 *   async execute(input) {
 *     return `Deployed!`;
 *   },
 * });
 * ```
 */

/** Context passed to a tool's execute function */
export interface CodemapToolContext {
  /** Absolute path to the `.codemap/tools/` directory containing this tool */
  toolsDir: string;
  /** Absolute path to the workspace/project root */
  workspace: string;
}

/**
 * A CodeMap custom tool definition.
 *
 * Use this for `.tool.ts` files in `.codemap/tools/`.
 *
 * `parameters` accepts:
 * - A Zod schema (`z.object({...})`) — gives you type inference in execute
 * - A JSON Schema object (`{ type: "object", properties: {...} }`) — zero dependencies
 * - `undefined` — tool takes no input
 *
 * @example With Zod (if your project uses it)
 * ```ts
 * import { z } from "zod";
 * import type { CodemapTool } from "@codemap-ai/tool-types";
 *
 * export default {
 *   name: "deploy",
 *   description: "Deploy to staging",
 *   parameters: z.object({ env: z.enum(["staging", "prod"]) }),
 *   async execute(input) { return `Deployed to ${input.env}`; },
 * } satisfies CodemapTool;
 * ```
 *
 * @example Without Zod (plain JSON Schema)
 * ```ts
 * import type { CodemapTool } from "@codemap-ai/tool-types";
 *
 * export default {
 *   name: "hello",
 *   description: "Say hello",
 *   parameters: {
 *     type: "object",
 *     properties: { name: { type: "string" } },
 *     required: ["name"],
 *   },
 *   async execute(input) { return `Hello ${input.name}!`; },
 * } satisfies CodemapTool;
 * ```
 *
 * @example No parameters
 * ```ts
 * export default {
 *   name: "ping",
 *   description: "Health check",
 *   async execute() { return "pong"; },
 * } satisfies CodemapTool;
 * ```
 */
export interface CodemapTool {
  /** Tool name — must be a valid identifier (letters, digits, underscores) */
  name: string;
  /** One-line description shown to the AI model */
  description: string;
  /**
   * Input parameters schema.
   *
   * - Zod schema: `z.object({ ... })` — type-safe input in execute()
   * - JSON Schema: `{ type: "object", properties: { ... } }`
   * - `undefined`: tool takes no input
   */
  parameters?: unknown;
  /**
   * Execute the tool.
   *
   * - `input` — validated input matching the parameters schema (Record if no Zod inference)
   * - `ctx` — execution context with workspace paths
   * - Return a string (shown to model) or an object (JSON-serialized)
   */
  execute: (
    input: Record<string, unknown>,
    ctx: CodemapToolContext,
  ) => Promise<string | object> | string | object;
}

/**
 * Helper to define a tool with type checking.
 *
 * Catches mistakes like missing `name`, wrong `execute` signature, etc.
 * Works without Zod — just validates the shape at compile time.
 *
 * @example
 * ```ts
 * import { defineTool } from "@codemap-ai/tool-types";
 *
 * export default defineTool({
 *   name: "deploy",
 *   description: "Deploy to staging",
 *   async execute(input) { return "done"; },
 * });
 * ```
 */
export function defineTool(tool: CodemapTool): CodemapTool {
  return tool;
}
