type TextContent = { type: "text"; text: string };

export type ToolData = Record<string, unknown> | unknown[];

export type Verbosity = "compact" | "normal" | "verbose" | "debug";

export const verbositySchemaValues = [
  "compact",
  "normal",
  "verbose",
  "debug",
] as const;

export type ToolOutputOptions = {
  verbosity?: Verbosity;
  limit?: number;
  max_chars?: number;
  include_raw?: boolean;
};

export type ToolEnvelopeMeta = Record<string, unknown> & {
  verbosity?: Verbosity;
  total?: number;
  returned?: number;
};

export type AgentHints = Record<string, unknown> & {
  recommendedNextTool?: string;
  recommendedPaths?: string[];
  avoidReadingFullFiles?: boolean;
};

export type ToolEnvelope<TItems = unknown> = Record<string, unknown> & {
  summary: string;
  items?: TItems[];
  nextActions?: string[];
  truncated?: boolean;
  truncationReason?: string;
  meta?: ToolEnvelopeMeta;
  agentHints?: AgentHints;
  display?: string;
  raw?: unknown;
};

export type ToolErrorShape = Record<string, unknown> & {
  code: string;
  message: string;
  details?: unknown;
};

export type ToolSuccessPayload<TData extends ToolData = ToolData> = Record<
  string,
  unknown
> & {
  summary: string;
  data: TData;
  isError?: false;
};

export type ToolErrorPayload = Record<string, unknown> & {
  summary: string;
  error: ToolErrorShape;
  isError: true;
};

export type ToolSuccessResult<TData extends ToolData = ToolData> = Record<
  string,
  unknown
> & {
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

export function normalizeVerbosity(value?: string): Verbosity {
  if (
    value === "compact" ||
    value === "normal" ||
    value === "verbose" ||
    value === "debug"
  ) {
    return value;
  }
  return "compact";
}

export function normalizeLimit(
  value: number | undefined,
  fallback = 10,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value as number));
}

export function normalizeMaxChars(
  value: number | undefined,
  fallback = 12000,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(500, Math.floor(value as number));
}

export function truncateText(
  text: string,
  maxChars: number,
): { text: string; truncated: boolean; truncationReason?: string } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, Math.max(0, maxChars - 80))}\n... [truncated: max_chars exceeded]`,
    truncated: true,
    truncationReason: "max_chars exceeded",
  };
}

export function buildToolEnvelope<TItems = unknown>(args: {
  summary: string;
  items?: TItems[];
  nextActions?: string[];
  truncated?: boolean;
  truncationReason?: string;
  meta?: ToolEnvelopeMeta;
  agentHints?: AgentHints;
  display?: string;
  raw?: unknown;
}): ToolEnvelope<TItems> {
  const envelope: ToolEnvelope<TItems> = {
    summary: args.summary,
  };

  if (args.items !== undefined) envelope.items = args.items;
  if (args.nextActions?.length) envelope.nextActions = args.nextActions;
  if (args.truncated !== undefined) envelope.truncated = args.truncated;
  if (args.truncationReason) envelope.truncationReason = args.truncationReason;
  if (args.meta) envelope.meta = args.meta;
  if (args.agentHints) envelope.agentHints = args.agentHints;
  if (args.display) envelope.display = args.display;
  if (args.raw !== undefined) envelope.raw = args.raw;

  return envelope;
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
 * Prepends context score warnings to a summary when the agent has skipped
 * mandatory orientation steps. Non-blocking — data is still returned.
 */
export function prependContextWarnings(
  summary: string,
  warnings: string[],
): string {
  if (warnings.length === 0) return summary;
  const block = warnings.map((w) => `⚠ ${w}`).join("\n");
  return `${block}\n\n${summary}`;
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
