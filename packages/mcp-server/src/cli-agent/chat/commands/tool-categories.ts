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
  get_working_diff:         "local",
  get_current_workspace_info: "local",
  get_agent_workflow:       "local",
  web_search:               "local",
  web_fetch:                "local",

  // ── Local index + optional cloud enhancement ─────────────────────────────
  explore_task:             "local",
  search_codebase:          "local",
  get_file:                 "local",
  get_files:                "local",
  find_usages:              "local",
  find_callers:             "local",
  find_related_files:       "local",
  get_symbol_context:       "local",

  summarize_feature_area:   "local",
  rename_symbol:            "local",
  move_symbols:             "local",
  code_review:              "local",
  find_cycles:              "local",
  get_diff:                 "local",

  // ── Auth required, no project needed ─────────────────────────────────────
  check_auth_status:        "auth",
  start_auth_flow:          "auth",
  wait_for_auth:            "auth",
  logout:                   "auth",
  get_project:              "auth",
  list_projects:            "auth",
  link_project:             "auth",
  check_github_connection:  "auth",
  get_github_connect_url:   "auth",
  disconnect_github:        "auth",
  list_github_repositories: "auth",
  search_github_repositories: "auth",
  check_gitlab_connection:  "auth",
  get_gitlab_connect_url:   "auth",
  disconnect_gitlab:        "auth",

  // ── Cloud project required ────────────────────────────────────────────────
  create_project:                "cloud",
  create_project_from_github:    "cloud",
  create_project_from_gitlab:    "cloud",
  trigger_reimport:              "cloud",
  wait_for_import:               "cloud",
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
