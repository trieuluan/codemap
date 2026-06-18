import { useState } from "react";
import { CodeBlock } from "streamdown";
import { CheckCircle2, ChevronDown, ListChecks, Loader2 } from "lucide-react";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "./ai-elements/tool.js";
import type { TaskItemData } from "./ai-elements/task.js";
import { buildUnifiedDiff } from "./ui/diff/utils/build-unified-diff.js";
import { DiffPreview } from "./ui/diff/preview.js";

interface ToolExecutionProps {
  toolCallId: string;
  name: string;
  args?: string | null;
  preview?: string | null;
  result?: string | null;
  isError?: boolean;
  workspaceRoot?: string | null;
}

/** Convert absolute path to workspace-relative (e.g. `packages/foo/bar.ts`). */
function toRelativePath(absPath: string, workspaceRoot: string | null | undefined): string {
  if (!workspaceRoot || !absPath.startsWith(workspaceRoot)) return absPath;
  const rel = absPath.slice(workspaceRoot.length);
  return rel.startsWith("/") ? rel.slice(1) : rel;
}

function CollapsibleSection({
  label,
  children,
  defaultOpen = true,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="collapsible-section">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-4 py-2 text-left"
        onClick={() => setOpen((prev) => !prev)}
      >
        <ChevronDown
          size={14}
          className="text-muted-foreground transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </button>
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 200ms ease-out",
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function friendlyTitle(name: string): string {
  return localName(name);
}

const MAX_RESULT_CHARS = 2000;

function truncateResult(result: string | null | undefined): string | null | undefined {
  if (!result || result.length <= MAX_RESULT_CHARS) return result;
  return result.slice(0, MAX_RESULT_CHARS) + `\n… (${result.length - MAX_RESULT_CHARS} chars truncated)`;
}

/** Strip MCP namespace prefix ("codemap · ") but keep the full tool name intact. */
function localName(name: string): string {
  if (name.includes(" · ")) return name.split(" · ").pop()!;
  return name;
}

function isEditTool(name: string): boolean {
  return /(?:string_replace_lsp|write_file|ast_smart_edit)(?:_ide)?$/.test(localName(name));
}

function isTaskTool(name: string): boolean {
  return /(?:^|_)(?:task_write|task_update|task_complete|task_check)(?:_ide)?$/.test(localName(name));
}

function parseTaskArgs(parsedArgs: Record<string, unknown> | null): TaskItemData[] | null {
  if (!parsedArgs || typeof parsedArgs !== "object") return null;
  const tasks = parsedArgs.tasks;
  if (!Array.isArray(tasks)) return null;
  const items: TaskItemData[] = [];
  for (const t of tasks) {
    if (!t || typeof t !== "object") continue;
    const taskRecord = t as Record<string, unknown>;
    if (typeof taskRecord.id === "string" && typeof taskRecord.content === "string") {
      items.push({
        id: taskRecord.id,
        content: taskRecord.content,
        status: (taskRecord.status === "pending" || taskRecord.status === "in_progress" || taskRecord.status === "completed")
          ? taskRecord.status
          : "pending",
        activeForm: typeof taskRecord.activeForm === "string" ? taskRecord.activeForm : undefined,
      });
    }
  }
  return items.length > 0 ? items : null;
}

function describeTaskUpdate(parsedArgs: Record<string, unknown> | null): string | null {
  if (!parsedArgs || typeof parsedArgs !== "object") return null;
  const id = typeof parsedArgs.id === "string" ? parsedArgs.id : null;
  if (!id) return null;
  const content = typeof parsedArgs.content === "string" ? parsedArgs.content : null;
  const status = typeof parsedArgs.status === "string" ? parsedArgs.status : null;
  const activeForm = typeof parsedArgs.activeForm === "string" ? parsedArgs.activeForm : null;

  const parts: string[] = [`Task ${id}`];
  if (status) {
    const label = status === "in_progress" ? "In Progress" : status === "completed" ? "Completed" : status === "pending" ? "Pending" : status;
    parts.push(`→ ${label}`);
  }
  if (content) {
    parts.push(`: ${content}`);
  } else if (activeForm) {
    parts.push(`: ${activeForm}`);
  }
  return parts.join(" ");
}

function describeTaskComplete(parsedArgs: Record<string, unknown> | null): string | null {
  if (!parsedArgs || typeof parsedArgs !== "object") return null;
  const id = typeof parsedArgs.id === "string" ? parsedArgs.id : null;
  return id ? `Completed task ${id}` : null;
}

function extractDiffText(result: string | null | undefined): string | null {
  if (!result) return null;
  const diffStart = result.indexOf("--- ");
  if (diffStart >= 0) return result.slice(diffStart).trim();
  if (/^[-+]{3}\s/m.test(result) || /^@@\s/m.test(result)) return result.trim();
  return null;
}

/**
 * Parse line range from tool result string.
 * Matches patterns like "(lines 47)", "(lines 47-49)", "(lines 10, 47-49)".
 * Returns [start, end] (1-based inclusive) or null.
 */
function parseLineRangesFromResult(result: string): [number, number] | null {
  const match = result.match(/\(lines?\s+(\d+)(?:-(\d+))?(?:,\s*\d+(?:-\d+)?)*\)/);
  if (!match) return null;
  const start = parseInt(match[1]!, 10);
  const end = match[2] ? parseInt(match[2]!, 10) : start;
  return [start, end];
}

const EXT_LANG: Record<string, string> = {
  ".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".jsx": "jsx",
  ".py": "python", ".rb": "ruby", ".go": "go", ".rs": "rust",
  ".java": "java", ".kt": "kotlin", ".swift": "swift",
  ".css": "css", ".scss": "scss", ".html": "html", ".htm": "html",
  ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
  ".md": "markdown", ".sh": "shell", ".bash": "shell", ".zsh": "shell",
  ".sql": "sql", ".xml": "xml", ".graphql": "graphql", ".gql": "graphql",
  ".vue": "vue", ".svelte": "svelte",
};

function languageFromPath(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return EXT_LANG[ext] ?? "plaintext";
}

interface ArgsPreview {
  filePath: string;
  diff?: string;
  content?: string;
  language?: string;
}

function generateArgsPreview(
  toolName: string,
  parsedArgs: Record<string, unknown> | null,
  workspaceRoot?: string | null,
  startLine?: number,
): ArgsPreview | null {
  if (!parsedArgs || typeof parsedArgs !== "object") return null;

  const absPath = typeof parsedArgs.path === "string" ? parsedArgs.path : null;
  if (!absPath) return null;
  const path = toRelativePath(absPath, workspaceRoot);

  const local = localName(toolName);

  // string_replace_lsp → unified diff from old_string / new_string
  if (/(?:^|_)(?:string_replace_lsp)(?:_ide)?$/.test(local)) {
    const oldStr = typeof parsedArgs.old_string === "string" ? parsedArgs.old_string : null;
    const newStr = typeof parsedArgs.new_string === "string" ? parsedArgs.new_string : null;
    if (oldStr === null || newStr === null) return null;
    return { filePath: path, diff: buildUnifiedDiff(path, oldStr.split("\n"), newStr.split("\n"), { startLine }) };
  }

  // ast_smart_edit → show pattern → replacement as diff
  if (/(?:^|_)(?:ast_smart_edit)(?:_ide)?$/.test(local)) {
    const pattern = typeof parsedArgs.pattern === "string" ? parsedArgs.pattern : null;
    const replacement = typeof parsedArgs.replacement === "string" ? parsedArgs.replacement : null;
    if (pattern === null || replacement === null) return null;
    return { filePath: path, diff: buildUnifiedDiff(path, pattern.split("\n"), replacement.split("\n"), { startLine }) };
  }

  // write_file → show content as code block
  if (/(?:^|_)(?:write_file)(?:_ide)?$/.test(local)) {
    const content = typeof parsedArgs.content === "string" ? parsedArgs.content : null;
    if (content === null) return null;
    return { filePath: path, content, language: languageFromPath(path) };
  }

  return null;
}

export function ToolExecution({
  toolCallId: _toolCallId,
  name,
  args,
  preview,
  result,
  isError,
  workspaceRoot,
}: ToolExecutionProps) {
  const state = isError
    ? ("output-error" as const)
    : result
      ? ("output-available" as const)
      : preview
        ? ("input-available" as const)
        : ("input-streaming" as const);

  const title = friendlyTitle(name);
  const titleWithPreview = preview ? `${title} · ${preview}` : title;
  const diffText = isEditTool(name) ? extractDiffText(result) : null;
  const rawOutputText = truncateResult(result);
  const outputText = diffText && rawOutputText?.includes(diffText) ? null : rawOutputText;

  const toolArgs = args ? JSON.parse(args) : null;
  const tasks = isTaskTool(name) ? parseTaskArgs(toolArgs) : null;
  const taskUpdateText = /task_update/.test(localName(name)) ? describeTaskUpdate(toolArgs) : null;
  const taskCompleteText = /task_complete/.test(localName(name)) ? describeTaskComplete(toolArgs) : null;
  const startLine = result && isEditTool(name) ? parseLineRangesFromResult(result)?.[0] : undefined;
  const previewData = generateArgsPreview(name, toolArgs, workspaceRoot, startLine);

  return (
    <Tool>
      <ToolHeader
        title={titleWithPreview}
        type={`tool-${name}`}
        state={state}
      />
      <ToolContent>
        {/* Edit tools: show diff (string_replace_lsp / ast_smart_edit) */}
        {previewData?.diff && (
          <CollapsibleSection label="Diff">
            <DiffPreview diff={previewData.diff} language={languageFromPath(previewData.filePath)} />
          </CollapsibleSection>
        )}
        {/* write_file: show file content as code */}
        {previewData?.content && (
          <CollapsibleSection label="Content">
            <CodeBlock
              language={previewData.language ?? "plaintext"}
              code={previewData.content}
            />
          </CollapsibleSection>
        )}
        {/* Task tools: compact inline indicator (full list in Plan tab) */}
        {isTaskTool(name) && tasks && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <ListChecks className="size-3.5 text-blue-400" />
            <span>Task list · {tasks.length} item{tasks.length !== 1 ? "s" : ""}</span>
          </div>
        )}
        {/* task_write with parse failure: generic indicator */}
        {isTaskTool(name) && !tasks && /task_write/.test(localName(name)) && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <ListChecks className="size-3.5 text-blue-400" />
            <span>Task list updated</span>
          </div>
        )}
        {/* task_update: compact inline message */}
        {taskUpdateText && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-blue-400" />
            <span>{taskUpdateText}</span>
          </div>
        )}
        {/* task_complete: compact completion message */}
        {taskCompleteText && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-green-400" />
            <span>{taskCompleteText}</span>
          </div>
        )}
        {/* Non-edit tools: show args via ToolInput (has "Parameters" label) */}
        {!previewData && toolArgs && !isTaskTool(name) && (
          <ToolInput input={toolArgs} />
        )}
        {/* Result / error output */}
        {(state === "output-available" || state === "output-error") && result && (
          <ToolOutput
            output={state === "output-error" ? undefined : outputText}
            errorText={state === "output-error" ? (rawOutputText ?? undefined) : undefined}
          />
        )}
      </ToolContent>
    </Tool>
  );
}
