export type PermissionPolicy = "allow" | "ask" | "deny";
export type ToolCategory = "read" | "edit" | "execute" | "mcp" | "other";

export interface AgentPermissionRules {
  categories: Record<ToolCategory, PermissionPolicy>;
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
  "reimport",
];

export function buildAgentPermissionRules(
  mcpServerIds: Iterable<string> = ["codemap"],
): AgentPermissionRules {
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
