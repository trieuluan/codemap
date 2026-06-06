/**
 * Public context passed to .tool.ts execute functions.
 */
export interface ScriptToolContext {
  /** The resolved tools directory this tool was loaded from */
  toolsDir: string;
  /** The current workspace/project root path */
  workspace: string;
}

/**
 * A resolved .tool.ts custom tool ready to be wrapped as a Mastra tool.
 */
export interface ResolvedCustomTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  source: "project" | "global";
  executeFn: (
    input: Record<string, unknown>,
    ctx: ScriptToolContext,
  ) => Promise<string>;
  scriptPath: string;
}
