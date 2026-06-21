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
import { MonacoDiffViewer, type MonacoDiffFile, languageFromPath } from "./MonacoDiffViewer.js";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "./ui/hover-card.js";

const FILE_PREVIEW_MAX_LINES = 60;

function FileHoverPreview({ filePath }: { filePath: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [language, setLanguage] = useState("plaintext");
  const [lines, setLines] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loaded, setLoaded] = useState(false);

  function handleOpen(open: boolean) {
    if (!open || loaded) return;
    void window.codemap.readFilePreview(filePath).then((result) => {
      setLoaded(true);
      if (!result) return;
      setContent(result.content);
      setLanguage(result.language);
      setLines(result.lines);
      setTruncated(result.truncated);
    });
  }

  return (
    <HoverCard openDelay={400} closeDelay={100} onOpenChange={handleOpen}>
      <HoverCardTrigger asChild>
        <span className="file-preview-trigger">{filePath}</span>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="bottom"
        className="file-preview-card w-[520px] max-w-[80vw] p-0"
      >
        <div className="file-preview-header">
          <span className="file-preview-path">{filePath}</span>
          {loaded && content && (
            <span className="file-preview-meta">
              {truncated ? `${FILE_PREVIEW_MAX_LINES} / ${lines} lines` : `${lines} lines`}
            </span>
          )}
        </div>
        <div className="file-preview-body">
          {!loaded && (
            <div className="file-preview-loading">
              <Loader2 size={14} className="animate-spin" />
            </div>
          )}
          {loaded && !content && (
            <div className="file-preview-empty">File not found</div>
          )}
          {loaded && content && (
            <CodeBlock language={language} code={content} />
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

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

interface ArgsPreview {
  filePath: string;
  diff?: MonacoDiffFile;
  content?: string;
  language?: string;
}

function generateArgsPreview(
  toolName: string,
  parsedArgs: Record<string, unknown> | null,
  workspaceRoot?: string | null,
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
    return {
      filePath: path,
      diff: {
        path,
        original: oldStr,
        modified: newStr,
        language: languageFromPath(path),
      },
    };
  }

  // ast_smart_edit → show pattern → replacement as diff
  if (/(?:^|_)(?:ast_smart_edit)(?:_ide)?$/.test(local)) {
    const pattern = typeof parsedArgs.pattern === "string" ? parsedArgs.pattern : null;
    const replacement = typeof parsedArgs.replacement === "string" ? parsedArgs.replacement : null;
    if (pattern === null || replacement === null) return null;
    return {
      filePath: path,
      diff: {
        path,
        original: pattern,
        modified: replacement,
        language: languageFromPath(path),
      },
    };
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
  const diffText = isEditTool(name) ? extractDiffText(result) : null;
  const rawOutputText = truncateResult(result);
  const outputText = diffText && rawOutputText?.includes(diffText) ? null : rawOutputText;

  const toolArgs = args ? JSON.parse(args) : null;
  const tasks = isTaskTool(name) ? parseTaskArgs(toolArgs) : null;
  const taskUpdateText = /task_update/.test(localName(name)) ? describeTaskUpdate(toolArgs) : null;
  const taskCompleteText = /task_complete/.test(localName(name)) ? describeTaskComplete(toolArgs) : null;
  const previewData = generateArgsPreview(name, toolArgs, workspaceRoot);

  // Build title node — if there's a file path preview, wrap it in a hover card
  const filePreviewPath = previewData?.filePath ?? null;
  const titleNode = preview ? (
    <span className="tool-title-with-preview">
      {title}
      <span className="tool-title-sep"> · </span>
      {filePreviewPath ? (
        <FileHoverPreview filePath={filePreviewPath} />
      ) : (
        <span className="tool-title-preview">{preview}</span>
      )}
    </span>
  ) : title;

  return (
    <Tool>
      <ToolHeader
        title={titleNode}
        type={`tool-${name}`}
        state={state}
      />
      <ToolContent>
        {/* Edit tools: show diff (string_replace_lsp / ast_smart_edit) */}
        {previewData?.diff && (
          <CollapsibleSection label="Diff">
            <MonacoDiffViewer
              className="tool-monaco-diff"
              files={[previewData.diff]}
              height={280}
            />
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
