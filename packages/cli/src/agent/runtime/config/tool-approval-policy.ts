import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  PermissionPolicy,
  PermissionRules,
  ToolCategory,
} from "@mastra/core/harness";

export type { PermissionPolicy, PermissionRules, ToolCategory };

const MUTATING_TOOL_NAMES = [
  "apply_patch",
  "ast_smart_edit",
  "delete_file",
  "edit_file",
  "mkdir",
  "move_file",
  "rename_file",
  "string_replace",
  "string_replace_lsp",
  "write_file",
  "move_symbols",
  "rename_symbol",
  "reimport",
];

const MUTATING_TOOL_PATTERN =
  /(^|_)(apply_patch|ast_smart_edit|delete_file|edit_file|mkdir|move_file|move_symbols|rename_file|rename_symbol|string_replace|string_replace_lsp|reimport|write_file)$/i;

export function isMutatingApprovalTool(name: string): boolean {
  return MUTATING_TOOL_PATTERN.test(name);
}

export function buildMastraPermissionRules(
  mcpServerIds: Iterable<string> = ["codemap"],
): PermissionRules {
  const tools: Record<string, PermissionPolicy> = {};
  const serverIds = [...mcpServerIds].filter(Boolean);

  for (const toolName of MUTATING_TOOL_NAMES) {
    tools[toolName] = "ask";
    for (const serverId of serverIds) {
      tools[`${serverId}_${toolName}`] = "ask";
    }
  }

  return {
    categories: {
      read: "allow",
      edit: "ask",
      execute: "ask",
      mcp: "allow",
      other: "allow",
    },
    tools,
  };
}

export function buildToolPreview(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const normalizedName = toolName.toLowerCase();

  // ── Diff preview for mutating file tools ────────────────────────────
  if (normalizedName.includes("apply_patch")) {
    const patch = getStringArg(args, ["patch", "input", "diff", "content"]);
    if (patch) return fenced("diff", patch);
  }

  if (normalizedName.includes("write_file")) {
    const filePath = getStringArg(args, [
      "path",
      "filePath",
      "file_path",
      "filename",
      "file",
    ]);
    const content = getStringArg(args, ["content", "text", "data"]);
    if (content != null) {
      return fenced("diff", buildUnifiedDiff(filePath, "", content));
    }
  }

  if (
    normalizedName.includes("edit_file") ||
    normalizedName.includes("string_replace")
  ) {
    const filePath = getStringArg(args, [
      "path",
      "filePath",
      "file_path",
      "filename",
      "file",
    ]);
    const oldText = getStringArg(args, [
      "oldString",
      "old_string",
      "search",
      "find",
      "target",
    ]);
    const newText = getStringArg(args, [
      "newString",
      "new_string",
      "replace",
      "replacement",
      "insert",
    ]);
    if (oldText != null || newText != null) {
      return fenced(
        "diff",
        buildFileEditDiff(filePath, oldText ?? "", newText ?? ""),
      );
    }
  }

  // ── Plan preview — full markdown ────────────────────────────────────
  if (normalizedName.includes("submit_plan")) {
    const title = getStringArg(args, ["title"]);
    const plan = getStringArg(args, ["plan"]);
    if (plan) {
      return title ? `# ${title}\n\n${plan}` : plan;
    }
  }

  // ── Execute command — show raw command ──────────────────────────────
  if (normalizedName === "execute_command") {
    const cmd = getStringArg(args, ["command"]);
    if (cmd) return `$ ${cmd}`;
  }

  // ── Task tools — compact summary ────────────────────────────────────
  if (
    normalizedName === "task_write" ||
    normalizedName === "task_update" ||
    normalizedName === "task_complete" ||
    normalizedName === "task_check"
  ) {
    return buildTaskSummary(toolName, args);
  }

  // ── Subagent — show type + truncated task ───────────────────────────
  if (normalizedName === "subagent") {
    const agentType = getStringArg(args, ["agentType"]);
    const task = getStringArg(args, ["task"]);
    const parts: string[] = [];
    if (agentType) parts.push(agentType);
    if (task) parts.push(task.length > 120 ? `${task.slice(0, 117)}...` : task);
    return parts.join(" · ") || compactJson(args);
  }

  // ── Read-only / MCP tools — compact JSON (truncated) ────────────────
  return fenced("json", compactJson(args));
}

function buildTaskSummary(
  toolName: string,
  args: Record<string, unknown>,
): string {
  // task_write: { tasks: [...] }
  if (toolName === "task_write") {
    const tasks = Array.isArray(args.tasks) ? args.tasks : [];
    if (tasks.length === 0) return "(empty task list)";
    const counts = countTaskStatuses(tasks);
    return formatTaskCounts(counts, tasks.length);
  }

  // task_update / task_complete: single task patch
  const id = getStringArg(args, ["id"]);
  const status = getStringArg(args, ["status"]);
  const content = getStringArg(args, ["content"]);
  const parts: string[] = [];
  if (id) parts.push(`#${id}`);
  if (status) parts.push(`→ ${status}`);
  if (content)
    parts.push(content.length > 80 ? `${content.slice(0, 77)}...` : content);
  return parts.join(" · ") || compactJson(args);
}

interface TaskStatusCounts {
  completed: number;
  inProgress: number;
  pending: number;
}

function countTaskStatuses(
  tasks: Array<Record<string, unknown>>,
): TaskStatusCounts {
  let completed = 0;
  let inProgress = 0;
  let pending = 0;
  for (const t of tasks) {
    const s = typeof t.status === "string" ? t.status : "pending";
    if (s === "completed") completed++;
    else if (s === "in_progress") inProgress++;
    else pending++;
  }
  return { completed, inProgress, pending };
}

function formatTaskCounts(c: TaskStatusCounts, total: number): string {
  const parts: string[] = [];
  if (c.completed) parts.push(`✓ ${c.completed}`);
  if (c.inProgress) parts.push(`▸ ${c.inProgress}`);
  if (c.pending) parts.push(`○ ${c.pending}`);
  return `${total} task${total !== 1 ? "s" : ""}: ${parts.join(", ")}`;
}

function getStringArg(
  args: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string") return value;
  }
  return null;
}

function fenced(language: string, content: string): string {
  return `~~~${language}\n${content.trimEnd()}\n~~~`;
}

function buildUnifiedDiff(
  filePath: string | null,
  oldText: string,
  newText: string,
): string {
  const path = filePath || "(unknown)";
  const oldLines = splitPreviewLines(oldText);
  const newLines = splitPreviewLines(newText);
  const oldRange = oldLines.length > 0 ? `1,${oldLines.length}` : "0,0";
  const newRange = newLines.length > 0 ? `1,${newLines.length}` : "0,0";

  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${oldRange} +${newRange} @@ ${path}`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join("\n");
}

const CONTEXT_LINES = 3;

/**
 * Context-aware diff for file edits: reads the file, finds oldText's real line
 * number, and generates a unified diff with surrounding context lines.
 * Falls back to simple diff if the file can't be read or oldText isn't found.
 */
function buildFileEditDiff(
  filePath: string | null,
  oldText: string,
  newText: string,
): string {
  if (!filePath || !oldText) {
    return buildUnifiedDiff(filePath, oldText, newText);
  }

  let fileContent: string;
  try {
    fileContent = readFileSync(resolve(filePath), "utf-8");
  } catch {
    return buildUnifiedDiff(filePath, oldText, newText);
  }

  const fileLines = fileContent.split("\n");
  const oldLines = splitPreviewLines(oldText);
  const newLines = splitPreviewLines(newText);

  // Find the first line of oldText in the file
  let matchIdx = findBlockStart(fileLines, oldLines);

  // oldText not found — edit may have already been applied (session restore).
  // Try locating newText to recover the correct line position.
  let useNewAsAnchor = false;
  if (matchIdx < 0 && newLines.length > 0) {
    matchIdx = findBlockStart(fileLines, newLines);
    useNewAsAnchor = true;
  }

  if (matchIdx < 0) {
    return buildUnifiedDiff(filePath, oldText, newText);
  }

  // If we had to fall back to newText as the anchor, the edit target no longer
  // exists in the file — the change is likely already applied. Signal this so
  // the model can avoid retrying an already-completed edit.
  if (useNewAsAnchor) {
    return `# ⚠ Target text not found — this edit may already be applied\n\n${buildUnifiedDiff(filePath, oldText, newText)}`;
  }

  const path = filePath;
  const anchorLength = useNewAsAnchor ? newLines.length : oldLines.length;
  const ctxStart = Math.max(0, matchIdx - CONTEXT_LINES);
  const ctxEnd = Math.min(fileLines.length, matchIdx + anchorLength + CONTEXT_LINES);

  const contextBefore = fileLines.slice(ctxStart, matchIdx);
  const contextAfter = fileLines.slice(matchIdx + anchorLength, ctxEnd);

  // Hunk header counts include context lines
  const hunkStartLine = ctxStart + 1; // 1-based line of first context line
  const oldHunkCount = contextBefore.length + oldLines.length + contextAfter.length;
  const newHunkCount = contextBefore.length + newLines.length + contextAfter.length;

  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${hunkStartLine},${oldHunkCount} +${hunkStartLine},${newHunkCount} @@`,
    ...contextBefore.map((line) => ` ${line}`),
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
    ...contextAfter.map((line) => ` ${line}`),
  ].join("\n");
}

/** Find the 0-based index where `block` starts in `lines`. Matches full lines. */
function findBlockStart(lines: string[], block: string[]): number {
  if (block.length === 0) return -1;
  const first = block[0];
  outer: for (let i = 0; i <= lines.length - block.length; i++) {
    if (lines[i] !== first) continue;
    for (let j = 1; j < block.length; j++) {
      if (lines[i + j] !== block[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function splitPreviewLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function compactJson(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 4000 ? `${json.slice(0, 4000)}\n...` : json;
  } catch {
    return String(value);
  }
}
