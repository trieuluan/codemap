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

  return fenced("json", compactJson(args));
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
