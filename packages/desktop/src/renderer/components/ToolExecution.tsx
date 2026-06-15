import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolOutput,
} from "../../components/ai-elements/tool.js";

interface ToolExecutionProps {
  toolCallId: string;
  name: string;
  preview?: string | null;
  result?: string | null;
}

// Human-readable labels for known tool names (after MCP prefix is stripped)
const TOOL_LABELS: Record<string, string> = {
  explore_task: "Explore task",
  search_codebase: "Search codebase",
  find_related_files: "Find related files",
  get_file: "Read file",
  get_project_map: "Get project map",
  get_project: "Get project",
  get_project_insights: "Get insights",
  symbol: "Inspect symbol",
  diff: "Show diff",
  refresh_local_index: "Refresh index",
  view_ide: "Read file",
  write_file_ide: "Write file",
  write_file: "Write file",
  string_replace_lsp_ide: "Edit file",
  string_replace_lsp: "Edit file",
  execute_command_ide: "Run command",
  execute_command: "Run command",
  search_content_ide: "Search content",
  search_content: "Search content",
  find_files_ide: "Find files",
  find_files: "Find files",
  web_search_ide: "Web search",
  web_search: "Web search",
  web_fetch_ide: "Fetch URL",
  web_fetch: "Fetch URL",
  ask_user_ide: "Ask user",
  lsp_inspect_ide: "Inspect symbol",
  mkdir_ide: "Create directory",
  delete_file_ide: "Delete file",
  file_stat_ide: "Stat file",
  ast_smart_edit_ide: "Smart edit",
  task_write_ide: "Update tasks",
  task_update_ide: "Update task",
  task_complete_ide: "Complete task",
  task_check_ide: "Check tasks",
  submit_plan_ide: "Submit plan",
};

function friendlyTitle(name: string): string {
  // name may already be formatted as "codemap · explore_task" or raw "codemap_explore_task"
  const local = name.includes(" · ")
    ? name.split(" · ").pop()!
    : name.includes("_")
      ? name.slice(name.indexOf("_") + 1)
      : name;
  return TOOL_LABELS[local] ?? name;
}

const MAX_RESULT_CHARS = 2000;

function truncateResult(result: string | null | undefined): string | null | undefined {
  if (!result || result.length <= MAX_RESULT_CHARS) return result;
  return result.slice(0, MAX_RESULT_CHARS) + `\n… (${result.length - MAX_RESULT_CHARS} chars truncated)`;
}

export function ToolExecution({
  toolCallId: _toolCallId,
  name,
  preview,
  result,
}: ToolExecutionProps) {
  const state = result
    ? ("output-available" as const)
    : preview
      ? ("input-available" as const)
      : ("input-streaming" as const);

  const title = friendlyTitle(name);
  const titleWithPreview = preview ? `${title} · ${preview}` : title;

  return (
    <Tool className="codemap-ai-tool" defaultOpen={!result}>
      <ToolHeader
        className="codemap-tool-header"
        title={titleWithPreview}
        type={`tool-${name}`}
        state={state}
      />
      <ToolContent>
        <ToolOutput
          className="codemap-tool-section"
          output={truncateResult(result)}
          errorText={undefined}
        />
      </ToolContent>
    </Tool>
  );
}
