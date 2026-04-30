type TextContent = { type: "text"; text: string };

export type ToolData = Record<string, unknown> | unknown[];

export type ToolErrorShape = Record<string, unknown> & {
  code: string;
  message: string;
  details?: unknown;
};

export type ToolSuccessPayload<TData extends ToolData = ToolData> =
  Record<string, unknown> & {
    summary: string;
    data: TData;
    isError?: false;
  };

export type ToolErrorPayload = Record<string, unknown> & {
  summary: string;
  error: ToolErrorShape;
  isError: true;
};

export type ToolSuccessResult<TData extends ToolData = ToolData> =
  Record<string, unknown> & {
    content: TextContent[];
    structuredContent: ToolSuccessPayload<TData>;
    isError?: false;
  };

export type ToolErrorResult = Record<string, unknown> & {
  content: TextContent[];
  structuredContent: ToolErrorPayload;
  isError: true;
};

export type ToolResult<TData extends ToolData = ToolData> =
  | ToolSuccessResult<TData>
  | ToolErrorResult;

function toTextContent(content: string): TextContent[] {
  return [{ type: "text", text: content }];
}

function toErrorShape(error: unknown): ToolErrorShape {
  if (error instanceof Error) {
    const maybeDetails =
      "details" in error ? (error as { details?: unknown }).details : undefined;

    return {
      code:
        "code" in error && typeof error.code === "string"
          ? error.code
          : error.name || "TOOL_ERROR",
      message: error.message,
      details: maybeDetails,
    };
  }

  return {
    code: "TOOL_ERROR",
    message: String(error),
  };
}

/** Wraps a string into the MCP text content response shape. */
export function text(content: string): ToolSuccessResult {
  return success(content, {});
}

/** Wraps a summary + machine-readable data into the MCP response shape. */
export function success<TData extends ToolData>(
  summary: string,
  data: TData,
): ToolSuccessResult<TData> {
  return {
    content: toTextContent(summary),
    structuredContent: {
      summary,
      data,
    },
  };
}

/** Wraps an error into the MCP error response shape. */
export function errorContent(error: unknown): ToolResult {
  const errorShape = toErrorShape(error);

  return {
    content: toTextContent(errorShape.message),
    structuredContent: {
      summary: errorShape.message,
      error: errorShape,
      isError: true,
    },
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
