import type { Message, ToolResult } from "./store.js";

export function normalizeToolDisplayName(toolName: string): string {
  return toolName.includes("__")
    ? toolName.slice(toolName.indexOf("__") + 2)
    : toolName;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringField(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function summarizeToolArgs(toolName: string, args: string): string {
  const displayName = normalizeToolDisplayName(toolName);
  const parsed = parseJsonObject(args);
  if (!parsed) return `Call ${displayName}`;

  const direct = stringField(parsed, [
    "activeForm",
    "content",
    "path",
    "query",
    "q",
    "url",
    "command",
    "id",
  ]);
  if (direct) return direct;

  const patterns = parsed.pattern;
  if (Array.isArray(patterns) && patterns.length > 0) {
    return patterns.map(String).join(", ");
  }

  return `Call ${displayName}`;
}

function summarizeToolResult(resultText: string): string {
  const errorPrefix = "[ERROR] ";
  const isError = resultText.startsWith(errorPrefix);
  const body = isError ? resultText.slice(errorPrefix.length) : resultText;
  const parsed = parseJsonObject(body);
  if (!parsed) return resultText;

  const content = stringField(parsed, ["content", "message", "summary"]);
  if (!content) return resultText;

  return isError ? `${errorPrefix}${content}` : content;
}

export function withToolCallSummary(
  messages: Message[],
  toolName: string,
  args: string,
  toolCallId?: string,
): Message[] {
  const displayName = normalizeToolDisplayName(toolName);
  const next = [...messages];

  for (let i = next.length - 1; i >= 0; i -= 1) {
    const msg = next[i];
    if (!msg) continue;
    if (msg.role === "user") break;
    if (
      msg.role === "tool_call" &&
      msg.name === displayName &&
      (!toolCallId || msg.toolCallId === toolCallId)
    ) {
      return next;
    }
  }

  const childLine = summarizeToolArgs(toolName, args);
  const toolCallMsg: Message = {
    role: "tool_call",
    name: displayName,
    toolCallId,
    content: childLine,
    timestamp: Date.now(),
  };
  next.push(toolCallMsg);
  return next;
}

/** Mark the most-recent pending line for toolName as done. */
export function markToolDone(
  messages: Message[],
  toolName: string,
  resultText: string,
): Message[] {
  const success = !resultText.includes("[ERROR]");
  const marker = success ? " ✓" : " ✗";
  const displayName = normalizeToolDisplayName(toolName);
  const summarizedResult = summarizeToolResult(resultText);
  const next = [...messages];

  let toolCallIndex = -1;
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const msg = next[i];
    if (!msg) continue;
    if (msg.role === "user") break;
    if (msg.role === "tool_call" && msg.name === displayName) {
      toolCallIndex = i;
      break;
    }
  }

  if (toolCallIndex >= 0) {
    const toolResult: ToolResult = {
      name: displayName,
      content: summarizedResult,
      fullContent: resultText,
      success,
    };
    const existingResults = next[toolCallIndex].toolResults ?? [];
    next[toolCallIndex] = {
      ...next[toolCallIndex],
      toolResults: [...existingResults, toolResult],
      content: next[toolCallIndex].content + marker,
      expandedContent: resultText,
    };
    return next;
  }
  return next;
}

export function appendToLastToolCallSummary(
  messages: Message[],
  content: string,
): Message[] {
  const next = [...messages];

  for (let i = next.length - 1; i >= 0; i -= 1) {
    const msg = next[i];
    if (!msg) continue;
    if (msg.role === "user") break;
    if (msg.role === "tool_call") {
      next[i] = {
        ...msg,
        expandedContent: msg.expandedContent
          ? `${msg.expandedContent}\n${content}`
          : content,
      };
      return next;
    }
  }
  return next;
}

export function markLastPendingToolCallCanceled(messages: Message[]): Message[] {
  const next = [...messages];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const msg = next[i];
    if (!msg) continue;
    if (msg.role === "user") break;
    if (msg.role !== "tool_call" || (msg.toolResults?.length ?? 0) > 0) {
      continue;
    }

    const name = msg.name ?? "tool";
    const content = "[ERROR] Canceled by user.";
    next[i] = {
      ...msg,
      content:
        msg.content.endsWith(" ✓") || msg.content.endsWith(" ✗")
          ? msg.content
          : `${msg.content} ✗`,
      toolResults: [
        ...(msg.toolResults ?? []),
        {
          name,
          content,
          fullContent: content,
          success: false,
        },
      ],
      expandedContent: content,
    };
    return next;
  }
  return next;
}
