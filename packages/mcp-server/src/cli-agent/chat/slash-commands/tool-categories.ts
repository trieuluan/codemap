/**
 * Tool category badges shown in /tools output.
 *
 * local — works offline, no auth, no project
 * auth  — needs login, no cloud project required
 * cloud — needs login + a linked cloud project
 */
export type ToolCategory = "local" | "auth" | "cloud";

export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // ── Local-only ───────────────────────────────────────────────────────────
  refresh_local_index:      "local",
  diff:                     "local",
  get_current_workspace_info: "local",
  web_search:               "local",
  web_fetch:                "local",

  // ── Local index + optional cloud enhancement ─────────────────────────────
  explore_task:             "local",
  search_codebase:          "local",
  get_file:                 "local",
  find_related_files:       "local",
  symbol:                   "local",

  rename_symbol:            "local",
  move_symbols:             "local",
  find_cycles:              "local",

  // ── Auth required, no project needed ─────────────────────────────────────
  check_auth_status:        "auth",
  login:                    "auth",
  logout:                   "auth",
  get_project:              "auth",
  list_projects:            "auth",
  link_project:             "auth",
  manage_git_connection:   "auth",
  list_github_repositories: "auth",

  // ── Cloud project required ────────────────────────────────────────────────
  create_project:                "cloud",
  reimport:                      "cloud",
  get_project_insights:          "cloud",
  get_project_map:               "cloud",
};

const BADGE: Record<ToolCategory, string> = {
  local: "\x1b[32m[local]\x1b[0m",
  auth:  "\x1b[33m[auth] \x1b[0m",
  cloud: "\x1b[36m[cloud]\x1b[0m",
};

export function toolBadge(toolName: string): string {
  const cat = TOOL_CATEGORIES[toolName] ?? "cloud";
  return BADGE[cat];
}
