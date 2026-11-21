/**
 * Emit debug logs to stderr only when CODEMAP_DEBUG=1.
 * Never write to stdout so MCP stdio JSON-RPC framing stays clean.
 */
export function debugLog(...args: unknown[]): void {
  if (process.env.CODEMAP_DEBUG === "1") {
    console.error(...args);
  }
}
