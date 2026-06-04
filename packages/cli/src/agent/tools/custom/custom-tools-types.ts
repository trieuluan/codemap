/**
 * Type definitions for CodeMap custom tools.
 *
 * Custom tools live in `.codemap/tools/` (project) or `~/.codemap/tools/` (global).
 * Each tool is defined by a JSON descriptor file (`<name>.tool.json`).
 */

/** How the tool executes */
export type CustomToolKind = "command" | "http" | "script";

/** Where the tool was discovered */
export type CustomToolSource = "project" | "global";

/** JSON schema for a `.codemap/tools/<name>.tool.json` file */
export interface CustomToolDescriptor {
  /** Tool name (must be a valid identifier). Must match filename stem. */
  name: string;
  /** One-line description shown to the model */
  description: string;
  /** Execution kind */
  kind: CustomToolKind;
  /** For kind="command": shell command template. Placeholders: {{input}}, {{arg_name}} */
  command?: string;
  /** For kind="http": URL template. Placeholders: {{input}}, {{arg_name}} */
  url?: string;
  /** For kind="http": HTTP method (default GET) */
  method?: string;
  /** For kind="script": path to JS/TS module relative to tools dir */
  script?: string;
  /** JSON Schema for the tool's input parameters */
  parameters?: Record<string, unknown>;
  /** Optional timeout in seconds (default 30) */
  timeoutSeconds?: number;
  /** Environment variables to set when executing */
  env?: Record<string, string>;
}

/** Resolved custom tool ready for execution */
export interface ResolvedCustomTool {
  name: string;
  description: string;
  kind: CustomToolKind;
  source: CustomToolSource;
  descriptor: CustomToolDescriptor;
  /** Absolute path to the tools directory containing this tool */
  toolsDir: string;
}
