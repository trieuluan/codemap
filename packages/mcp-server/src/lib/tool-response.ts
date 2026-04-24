type TextContent = { type: "text"; text: string };
type ToolResult = { content: TextContent[]; isError?: boolean };

/** Wraps a string into the MCP text content response shape. */
export function text(content: string): ToolResult {
  return { content: [{ type: "text", text: content }] };
}

/** Wraps an error into the MCP error response shape. */
export function errorContent(error: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  };
}

/**
 * Wraps a tool handler so any thrown error is caught and returned as
 * an MCP error response instead of crashing the server.
 */
export function withToolError<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<ToolResult>,
): (...args: TArgs) => Promise<ToolResult> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return errorContent(error);
    }
  };
}
