/** Introspection helpers for custom tools and hook reloads. */
import type { ResolvedCustomTool } from "@codemap-ai/runtime-node";
import {
  getCustomToolPaths,
  syncHooksToMastra,
  getSingleton,
  getCachedCustomTools,
} from "@codemap-ai/runtime-node";

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
