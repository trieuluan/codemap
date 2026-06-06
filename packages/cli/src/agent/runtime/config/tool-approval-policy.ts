import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { structuredPatch, formatPatch } from "diff";
import type {
  PermissionPolicy,
  PermissionRules,
  ToolCategory,
} from "@mastra/core/harness";

export type { PermissionPolicy, PermissionRules, ToolCategory };

/** Number of context lines shown above/below edits in preview diffs. */
export const PREVIEW_CONTEXT_LINES = 5;

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

// ── Virtual Document Buffer ────────────────────────────────────────────
// In-memory file state for edit tools. Tracks cumulative edits to the same
// file within a session so that sequential edits produce accurate diffs.
const virtualBuffers = new Map<string, string>();

const MAX_VIRTUAL_BUFFERS = 50;

function getOrCreateBuffer(filePath: string): string | null {
  if (virtualBuffers.has(filePath)) return virtualBuffers.get(filePath)!;
  try {
    const content = readFileSync(resolve(filePath), "utf-8");
    if (virtualBuffers.size >= MAX_VIRTUAL_BUFFERS) {
      const oldest = virtualBuffers.keys().next().value;
      if (oldest) virtualBuffers.delete(oldest);
    }
    virtualBuffers.set(filePath, content);
    return content;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("EACCES")) {
      console.error(`[virtualBuffer] permission denied: ${filePath}`);
    }
    return null;
  }
}

export function clearVirtualBuffers(): void {
  virtualBuffers.clear();
}

/**
 * Apply an edit to the virtual document buffer and return a diff preview
 * with correct line numbers. Returns null if the edit can't be applied
 * (file not found or old text not matched).
 */
export function previewEditWithVirtualBuffer(
  toolName: string,
  args: Record<string, unknown>,
): string | null {
  const normalizedName = toolName.toLowerCase();
  const filePath = getStringArg(args, [
    "path",
    "filePath",
    "file_path",
    "filename",
    "file",
  ]);
  if (!filePath) return null;

  const isWriteFile = normalizedName.includes("write_file");
  const isEdit =
    normalizedName.includes("edit_file") ||
    normalizedName.includes("string_replace");

  if (isWriteFile) {
    const content = getStringArg(args, ["content", "text", "data"]);
    if (content == null) return null;
    const current = getOrCreateBuffer(filePath) ?? "";
    virtualBuffers.set(filePath, content);
    return buildFocusedDiff(filePath, current, content);
  }

  if (isEdit) {
    const oldText = getStringArg(args, [
      "oldString",
      "old_string",
      "old_str",
      "search",
      "find",
      "target",
    ]);
    const newText = getStringArg(args, [
      "newString",
      "new_string",
      "new_str",
      "replace",
      "replacement",
      "insert",
    ]);
    if (oldText == null && newText == null) return null;

    const current = getOrCreateBuffer(filePath);
    if (current == null) return null;

    const old = oldText ?? "";
    if (!old) {
      // No old text — treat as full replace
      virtualBuffers.set(filePath, newText ?? "");
      return buildFocusedDiff(filePath, current, newText ?? "");
    }

    const match = findOldTextInFile(current, old);
    if (!match) return null; // Can't locate — caller falls back

    const [start, end] = match;
    const newContent =
      current.slice(0, start) + (newText ?? "") + current.slice(end);
    virtualBuffers.set(filePath, newContent);
    return buildFocusedDiff(filePath, current, newContent);
  }

  return null;
}

/**
 * Like previewEditWithVirtualBuffer but also returns the 1-based line range
 * of the edit in the pre-edit file. Used by tool_end to store line info
 * before the buffer is updated.
 */
export function previewEditWithLineInfo(
  toolName: string,
  args: Record<string, unknown>,
): { preview: string | null; lineRange: [number, number] | null } {
  const normalizedName = toolName.toLowerCase();
  const filePath = getStringArg(args, [
    "path",
    "filePath",
    "file_path",
    "filename",
    "file",
  ]);
  if (!filePath) return { preview: null, lineRange: null };

  const isEdit =
    normalizedName.includes("edit_file") ||
    normalizedName.includes("string_replace");

  if (!isEdit) {
    return { preview: previewEditWithVirtualBuffer(toolName, args), lineRange: null };
  }

  const oldText = getStringArg(args, [
    "oldString",
    "old_string",
    "old_str",
    "search",
    "find",
    "target",
  ]);
  const newText = getStringArg(args, [
    "newString",
    "new_string",
    "new_str",
    "replace",
    "replacement",
    "insert",
  ]);
  if (oldText == null && newText == null) return { preview: null, lineRange: null };

  const current = getOrCreateBuffer(filePath);
  if (current == null) return { preview: null, lineRange: null };

  const old = oldText ?? "";
  let lineRange: [number, number] | null = null;

  if (old) {
    const match = findOldTextInFile(current, old);
    if (match) {
      const [start, end] = match;
      const startLine = current.slice(0, start).split("\n").length;
      const endLine = current.slice(0, end).split("\n").length;
      lineRange = [startLine, endLine];
    }
  }

  const preview = previewEditWithVirtualBuffer(toolName, args);
  return { preview, lineRange };
}

/**
 * Generate a focused ±3 context-line diff between old and new full-file
 * content. Hunk line numbers reflect the real file position.
 */
function buildFocusedDiff(
  filePath: string,
  oldFull: string,
  newFull: string,
): string {
  const name = `a/${filePath}`;
  const bName = `b/${filePath}`;

  if (oldFull === newFull) return "(no changes)";

  const oldLines = oldFull.split("\n");
  const newLines = newFull.split("\n");

  // Find first differing line
  let firstDiff = 0;
  const minLen = Math.min(oldLines.length, newLines.length);
  while (firstDiff < minLen && oldLines[firstDiff] === newLines[firstDiff]) {
    firstDiff++;
  }

  // Find last differing line
  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (
    oldEnd > firstDiff &&
    newEnd > firstDiff &&
    oldLines[oldEnd] === newLines[newEnd]
  ) {
    oldEnd--;
    newEnd--;
  }

  const oldSliceStart = Math.max(0, firstDiff - PREVIEW_CONTEXT_LINES);
  const oldSliceEnd = Math.min(
    oldLines.length,
    oldEnd + PREVIEW_CONTEXT_LINES + 1,
  );
  const newSliceStart = Math.max(0, firstDiff - PREVIEW_CONTEXT_LINES);
  const newSliceEnd = Math.min(
    newLines.length,
    newEnd + PREVIEW_CONTEXT_LINES + 1,
  );

  const oldSlice = oldLines.slice(oldSliceStart, oldSliceEnd).join("\n");
  const newSlice = newLines.slice(newSliceStart, newSliceEnd).join("\n");

  const patch = structuredPatch(
    name,
    bName,
    oldSlice,
    newSlice,
    undefined,
    undefined,
    { context: PREVIEW_CONTEXT_LINES },
  );
  for (const hunk of patch.hunks) {
    hunk.oldStart += oldSliceStart;
    hunk.newStart += newSliceStart;
  }

  return formatPatch(patch);
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

  if (
    normalizedName.includes("write_file") ||
    normalizedName.includes("edit_file") ||
    normalizedName.includes("string_replace")
  ) {
    const vdbPreview = previewEditWithVirtualBuffer(toolName, args);
    if (vdbPreview) return fenced("diff", vdbPreview);
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

/**
 * Find oldText in fileContent using line-based matching that tolerates
 * trailing-whitespace differences. Returns the character range [start, end)
 * in the original fileContent, or null if not found.
 */
function findOldTextInFile(
  fileContent: string,
  oldText: string,
): [number, number] | null {
  const fileLines = fileContent.split("\n");
  const oldLines = oldText.replace(/\r\n/g, "\n").split("\n");

  // Strip trailing empty line from oldText (common when old_string ends with \n)
  if (oldLines.length > 0 && oldLines[oldLines.length - 1] === "") {
    oldLines.pop();
  }
  if (oldLines.length === 0) return null;

  const strip = (l: string) => l.replace(/[ \t]+$/, "");
  const normFileLines = fileLines.map(strip);
  const normOldLines = oldLines.map(strip);

  // Find the matching block of lines in the file
  for (let i = 0; i <= fileLines.length - oldLines.length; i++) {
    let match = true;
    for (let j = 0; j < oldLines.length; j++) {
      if (normFileLines[i + j] !== normOldLines[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      // Calculate character positions from line indices
      let charStart = 0;
      for (let k = 0; k < i; k++) {
        charStart += fileLines[k].length + 1; // +1 for \n
      }
      let charEnd = charStart;
      for (let k = 0; k < oldLines.length; k++) {
        charEnd += fileLines[i + k].length + 1; // +1 for \n
      }
      // Remove the last +1 if oldText doesn't end with \n
      if (!oldText.endsWith("\n")) {
        charEnd -= 1;
      }
      return [charStart, charEnd];
    }
  }
  return null;
}

/**
 * Parse line ranges from edit_file / string_replace_lsp tool result.
 * Matches patterns like "(lines 47)", "(lines 47-49)", "(lines 10, 47-49)".
 * Returns the first line range [start, end] (1-based inclusive) or null.
 */
export function parseLineRangesFromResult(
  result: string,
): [number, number] | null {
  const match = result.match(
    /\(lines?\s+(\d+)(?:-(\d+))?(?:,\s*\d+(?:-\d+)?)*\)/,
  );
  if (!match) return null;
  const start = parseInt(match[1]!, 10);
  const end = match[2] ? parseInt(match[2]!, 10) : start;
  return [start, end];
}

/**
 * Rebuild an edit diff preview with correct line numbers from tool result.
 * Used at tool_end to correct the hunk header when the tool_start preview
 * fell back to @@ -1.
 */
export function rebuildEditPreviewWithLineRanges(
  toolName: string,
  args: Record<string, unknown>,
  result: string,
  storedLineRange?: [number, number] | null,
): string | null {
  const ranges = parseLineRangesFromResult(result) ?? storedLineRange ?? null;
  if (!ranges) return null;

  const normalizedName = toolName.toLowerCase();
  if (
    !normalizedName.includes("edit_file") &&
    !normalizedName.includes("string_replace")
  ) {
    return null;
  }

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
    "old_str",
    "search",
    "find",
    "target",
  ]);
  const newText = getStringArg(args, [
    "newString",
    "new_string",
    "new_str",
    "replace",
    "replacement",
    "insert",
  ]);
  if (!filePath || (oldText == null && newText == null)) return null;

  const old = oldText ?? "";
  const new_ = newText ?? "";
  const name = filePath;
  const aName = `a/${name}`;
  const bName = `b/${name}`;

  // Snippet diff offset to the line from tool result (file already edited at this point)
  // Find the actual changed region and add context around it
  const oldLines = old.split("\n");
  const newLines = new_.split("\n");
  let firstDiff = 0;
  const minLen = Math.min(oldLines.length, newLines.length);
  while (firstDiff < minLen && oldLines[firstDiff] === newLines[firstDiff]) firstDiff++;
  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd > firstDiff && newEnd > firstDiff && oldLines[oldEnd] === newLines[newEnd]) { oldEnd--; newEnd--; }

  const ctxStart = Math.max(0, firstDiff - PREVIEW_CONTEXT_LINES);
  const oldCtxEnd = Math.min(oldLines.length, oldEnd + PREVIEW_CONTEXT_LINES + 1);
  const newCtxEnd = Math.min(newLines.length, newEnd + PREVIEW_CONTEXT_LINES + 1);

  const oldSlice = oldLines.slice(ctxStart, oldCtxEnd).join("\n");
  const newSlice = newLines.slice(ctxStart, newCtxEnd).join("\n");

  const snippetPatch = structuredPatch(
    aName,
    bName,
    oldSlice,
    newSlice,
    undefined,
    undefined,
    { context: PREVIEW_CONTEXT_LINES },
  );
  const offset = (ranges[0] - (snippetPatch.hunks[0]?.newStart ?? 1)) + ctxStart;
  for (const hunk of snippetPatch.hunks) {
    hunk.oldStart += offset;
    hunk.newStart += offset;
  }
  return fenced("diff", formatPatch(snippetPatch));
}

function compactJson(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 4000 ? `${json.slice(0, 4000)}\n...` : json;
  } catch {
    return String(value);
  }
}
