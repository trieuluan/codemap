/**
 * Introspection — custom tools, hooks reload.
 *
 * Extracted from harness-runtime.ts.
 */
import type { ResolvedCustomTool } from "../../tools/custom/index.js";
import { getCustomToolPaths } from "../../tools/custom/index.js";
import { syncHooksToMastra } from "../../tools/hooks/index.js";
import { getSingleton, getCachedCustomTools } from "../harness/lifecycle.js";

/** Get the list of loaded custom tools (for /tools command). */
export function getLoadedCustomTools(): ResolvedCustomTool[] {
  return getCachedCustomTools();
}

/** Get the paths where custom tools are discovered. */
export { getCustomToolPaths };

/**
 * Re-sync hooks from .codemap/hooks.json to .mastracode/hooks.json
 * and reload the Mastra HookManager. Used by the /hooks command.
 */
export function reloadHooks(): void {
  try {
    const workspaceRoot = process.env.WORKSPACE_ROOT ?? process.cwd();
    syncHooksToMastra(workspaceRoot);
    getSingleton()?.hookManager?.reload?.();
  } catch {
    /* non-fatal */
  }
}
