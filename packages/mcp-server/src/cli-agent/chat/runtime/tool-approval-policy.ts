type PermissionPolicy = "allow" | "ask" | "deny";
type ToolCategory = "read" | "edit" | "execute" | "mcp";

export interface PermissionRules {
  categories: Partial<Record<ToolCategory, PermissionPolicy>>;
  tools: Record<string, PermissionPolicy>;
}

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
  "trigger_reimport",
];

const MUTATING_TOOL_PATTERN =
  /(^|_)(apply_patch|ast_smart_edit|delete_file|edit_file|mkdir|move_file|move_symbols|rename_file|rename_symbol|string_replace|string_replace_lsp|trigger_reimport|write_file)$/i;

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
    },
    tools,
  };
}

export function buildToolPreview(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const normalizedName = toolName.toLowerCase();

  if (normalizedName.includes("apply_patch")) {
    const patch = getStringArg(args, ["patch", "input", "diff", "content"]);
    if (patch) return fenced("diff", patch);
  }

  if (normalizedName.includes("write_file")) {
    const filePath = getStringArg(args, ["path", "filePath", "file_path", "filename", "file"]);
    const content = getStringArg(args, ["content", "text", "data"]);
    if (content != null) {
      return fenced("diff", buildUnifiedDiff(filePath, "", content));
    }
  }

  if (
    normalizedName.includes("edit_file") ||
    normalizedName.includes("string_replace")
  ) {
    const filePath = getStringArg(args, ["path", "filePath", "file_path", "filename", "file"]);
    const oldText = getStringArg(args, ["oldString", "old_string", "search", "find", "target"]);
    const newText = getStringArg(args, ["newString", "new_string", "replace", "replacement", "insert"]);
    if (oldText != null || newText != null) {
      return fenced("diff", buildUnifiedDiff(filePath, oldText ?? "", newText ?? ""));
    }
  }

  if (normalizedName.includes("submit_plan")) {
    const title = getStringArg(args, ["title"]);
    const plan = getStringArg(args, ["plan"]);
    if (plan) {
      return title ? `# ${title}\n\n${plan}` : plan;
    }
  }

  if (
    normalizedName.endsWith("task_write") ||
    normalizedName.endsWith("task_update") ||
    normalizedName.endsWith("task_complete")
  ) {
    const taskPreview = buildTaskListPreview(args);
    if (taskPreview) return taskPreview;
  }

  return fenced("json", compactJson(args));
}

interface TaskItem {
  id?: string;
  content?: string;
  activeForm?: string;
  status?: string;
}

function buildTaskListPreview(args: Record<string, unknown>): string | null {
  const tasks = extractTaskList(args);
  if (!tasks) return null;
  if (tasks.length === 0) return "_(empty task list)_";

  const lines: string[] = [`**Task list (${tasks.length})**`, ""];
  for (const task of tasks) {
    lines.push(formatTaskLine(task));
  }
  return lines.join("\n");
}

function extractTaskList(args: Record<string, unknown>): TaskItem[] | null {
  const value = args.tasks;
  if (Array.isArray(value)) {
    return value.filter((item): item is TaskItem => isPlainObject(item));
  }
  // task_update / task_complete operate on a single task — wrap into list.
  if (typeof args.id === "string" || typeof args.content === "string") {
    return [args as TaskItem];
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatTaskLine(task: TaskItem): string {
  const status = (task.status ?? "pending").toLowerCase();
  const label =
    status === "in_progress" && task.activeForm
      ? task.activeForm
      : task.content ?? task.activeForm ?? "(untitled)";

  const marker =
    status === "completed"
      ? "- [x]"
      : status === "in_progress"
        ? "- [~]"
        : "- [ ]";

  const display = status === "completed" ? `~~${label}~~` : label;
  const trail = status === "in_progress" ? " _(in progress)_" : "";
  return `${marker} ${display}${trail}`;
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
