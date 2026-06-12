import type { Message, TaskListItem, ToolResult } from "../../state/types.js";
import type { Store } from "../../state/store-class.js";
import { C_SUCCESS, C_ERROR, C_MUTED, RESET } from "../../../tui/theme.js";

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
    "title",
    "question",
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

function formatElapsedDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function withToolCallSummary(
  messages: Message[],
  toolName: string,
  args: string,
  toolCallId?: string,
  createdAt?: number,
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
    timestamp: createdAt ?? Date.now(),
    startedAtMs: Date.now(),
  };
  next.push(toolCallMsg);
  return next;
}

/** Mark the most-recent pending line for toolName as done. */
export function markToolDone(
  messages: Message[],
  toolName: string,
  resultText: string,
  toolCallId?: string,
): Message[] {
  const success = !resultText.startsWith("[ERROR] ");
  const statusMarker = success ? ` ${C_SUCCESS}✓${RESET}` : ` ${C_ERROR}✗${RESET}`;
  const displayName = normalizeToolDisplayName(toolName);
  const summarizedResult = summarizeToolResult(resultText);
  const next = [...messages];

  let toolCallIndex = -1;
  for (const mode of ["id", "name"] as const) {
    if (toolCallIndex >= 0) break;
    if (mode === "id" && !toolCallId) continue;
    for (let i = next.length - 1; i >= 0; i -= 1) {
      const msg = next[i];
      if (!msg) continue;
      if (msg.role === "user") break;
      if (
        msg.role === "tool_call" &&
        ((mode === "id" && msg.toolCallId === toolCallId) ||
          (mode === "name" && msg.name === displayName))
      ) {
        toolCallIndex = i;
        break;
      }
    }
  }

  if (toolCallIndex >= 0) {
    const resultName = displayName || next[toolCallIndex]?.name || displayName;
    const toolResult: ToolResult = {
      name: resultName,
      content: summarizedResult,
      fullContent: resultText,
      success,
    };
    const existingResults = next[toolCallIndex].toolResults ?? [];
    if (existingResults.some((result) => result.fullContent === resultText)) {
      return next;
    }
    const startedAt = next[toolCallIndex].startedAtMs ?? next[toolCallIndex].timestamp;
    const elapsed = typeof startedAt === "number" ? Date.now() - startedAt : -1;
    const durationSuffix = formatElapsedDuration(elapsed);
    const marker = durationSuffix
      ? `${statusMarker} ${C_MUTED}${durationSuffix}${RESET}`
      : statusMarker;
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

export function setToolCallPreview(messages: Message[], preview: string): Message[] {
  const next = [...messages];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const msg = next[i];
    if (!msg) continue;
    if (msg.role === "user") break;
    if (msg.role === "tool_call") {
      next[i] = { ...msg, previewContent: preview };
      return next;
    }
  }
  return next;
}

/**
 * Update the preview content of a specific tool call by its toolCallId.
 * Used at tool_end to correct line numbers in the preview diff.
 */
export function setToolCallPreviewById(
  messages: Message[],
  toolCallId: string,
  preview: string,
): Message[] {
  const next = [...messages];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const msg = next[i];
    if (!msg) continue;
    if (msg.role === "tool_call" && msg.toolCallId === toolCallId) {
      next[i] = { ...msg, previewContent: preview };
      return next;
    }
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
        msg.content.replace(/\x1b\[[0-9;]*m/g, "").endsWith(" ✓") ||
        msg.content.replace(/\x1b\[[0-9;]*m/g, "").endsWith(" ✗")
          ? msg.content
          : `${msg.content} ${C_ERROR}✗${RESET}`,
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

// ─── Task List Sync ───────────────────────────────────────

function isTaskTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return (
    normalized.includes("task_write") ||
    normalized.includes("task_update") ||
    normalized.includes("task_complete") ||
    normalized.includes("task_check")
  );
}

/**
 * Update the store's taskList based on a task tool call.
 * Called from onToolResult in chat-terminal.ts.
 *
 * @param store - UI store
 * @param toolName - raw tool name (e.g. "codemap_task_write" or display name "codemap · task_write")
 * @param argsJson - JSON string of tool arguments (from onToolStart)
 * @param resultJson - JSON string of tool result (from onToolResult)
 */
export function syncTaskListFromTool(
  store: Store,
  toolName: string,
  argsJson: string,
  resultJson: string,
): void {
  if (!isTaskTool(toolName)) return;

  const args = parseJsonObject(argsJson);
  if (!args) return;

  const result = parseJsonObject(resultJson);
  const resultTasks = extractTasksFromResult(result);

  const normalized = toolName.toLowerCase();

  if (normalized.includes("task_write")) {
    handleTaskWrite(store, args, resultTasks);
  } else if (normalized.includes("task_update")) {
    handleTaskUpdate(store, args, resultTasks);
  } else if (normalized.includes("task_complete")) {
    handleTaskComplete(store, args, resultTasks);
  } else if (normalized.includes("task_check")) {
    handleTaskCheck(store, resultTasks);
  }
}

function extractTasksFromResult(
  result: Record<string, unknown> | null,
): TaskListItem[] | null {
  if (!result) return null;

  // Try structuredContent.data.tasks first (nested MCP result)
  const structured =
    result.structuredContent &&
    typeof result.structuredContent === "object" &&
    !Array.isArray(result.structuredContent)
      ? (result.structuredContent as Record<string, unknown>)
      : null;
  if (structured) {
    const data = structured.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const tasks = (data as Record<string, unknown>).tasks;
      if (Array.isArray(tasks)) {
        const filtered = tasks.filter(
          (t): t is TaskListItem =>
            typeof t === "object" && t !== null && typeof (t as Record<string, unknown>).id === "string",
        );
        if (filtered.length > 0) return filtered;
      }
    }
  }

  // Fallback: check top-level tasks (tool result returns tasks directly)
  const topLevelTasks = result.tasks;
  if (Array.isArray(topLevelTasks)) {
    const filtered = topLevelTasks.filter(
      (t): t is TaskListItem =>
        typeof t === "object" && t !== null && typeof (t as Record<string, unknown>).id === "string",
    );
    if (filtered.length > 0) return filtered;
  }

  return null;
}

function handleTaskWrite(
  store: Store,
  args: Record<string, unknown>,
  resultTasks: TaskListItem[] | null,
): void {
  const inputTasks = extractInputTasks(args);
  if (!inputTasks && !resultTasks) return;

  // Empty list means "clear all tasks"
  const incomingTasks = resultTasks ?? inputTasks;
  if (incomingTasks && incomingTasks.length === 0) {
    store.dispatch({ taskList: [], taskListVisible: false });
    return;
  }

  store.dispatch((prev) => {
    const prevById = new Map(prev.taskList.map((t) => [t.id, t]));

    // Build new list from incoming tasks only (replace, not merge).
    // Preserve status/activeForm from existing tasks with same ID.
    const source = resultTasks ?? inputTasks ?? [];
    const next: TaskListItem[] = [];
    for (const t of source) {
      if (!t.id) continue;
      const prev = prevById.get(t.id);
      next.push({
        id: t.id,
        content: t.content ?? prev?.content ?? "",
        status: (t.status ?? prev?.status ?? "pending") as TaskListItem["status"],
        activeForm: t.activeForm ?? prev?.activeForm ?? "",
      });
    }

    return { taskList: next, taskListVisible: true };
  });
}

function handleTaskUpdate(
  store: Store,
  args: Record<string, unknown>,
  resultTasks: TaskListItem[] | null,
): void {
  // If tool result returns full task list, use it as authoritative source
  if (resultTasks && resultTasks.length > 0) {
    store.dispatch({ taskList: resultTasks });
    return;
  }

  const id = typeof args.id === "string" ? args.id : null;
  if (!id) return;

  const content = typeof args.content === "string" ? args.content : undefined;
  const status = typeof args.status === "string" ? args.status : undefined;
  const activeForm = typeof args.activeForm === "string" ? args.activeForm : undefined;

  store.dispatch((prev) => ({
    taskList: prev.taskList.map((t) =>
      t.id === id
        ? {
            ...t,
            ...(content !== undefined && { content }),
            ...(status !== undefined && { status: status as TaskListItem["status"] }),
            ...(activeForm !== undefined && { activeForm }),
          }
        : t,
    ),
  }));
}

function handleTaskComplete(
  store: Store,
  args: Record<string, unknown>,
  resultTasks: TaskListItem[] | null,
): void {
  // If tool result returns full task list, use it as authoritative source
  if (resultTasks && resultTasks.length > 0) {
    store.dispatch({ taskList: resultTasks });
    return;
  }

  const id = typeof args.id === "string" ? args.id : null;
  if (!id) return;

  store.dispatch((prev) => ({
    taskList: prev.taskList.map((t) =>
      t.id === id ? { ...t, status: "completed" as const } : t,
    ),
  }));
}

function handleTaskCheck(
  store: Store,
  resultTasks: TaskListItem[] | null,
): void {
  if (!resultTasks) return;
  store.dispatch({ taskList: resultTasks });
}

interface InputTask {
  id?: string;
  content?: string;
  status?: string;
  activeForm?: string;
}

function extractInputTasks(
  args: Record<string, unknown>,
): InputTask[] | null {
  const tasks = args.tasks;
  if (Array.isArray(tasks)) {
    return tasks.filter(
      (t): t is InputTask => typeof t === "object" && t !== null,
    );
  }
  return null;
}
