import { type BundledLanguage } from "shiki";
import { CodeBlock } from "./ai-elements/code-block.js";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "./ai-elements/tool.js";
import { buildUnifiedDiff } from "./diff/utils.js";
import { DiffPreview } from "./diff/index.js";

interface ToolExecutionProps {
  toolCallId: string;
  name: string;
  args?: string | null;
  preview?: string | null;
  result?: string | null;
  isError?: boolean;
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

function extractDiffText(result: string | null | undefined): string | null {
  if (!result) return null;
  const diffStart = result.indexOf("--- ");
  if (diffStart >= 0) return result.slice(diffStart).trim();
  if (/^[-+]{3}\s/m.test(result) || /^@@\s/m.test(result)) return result.trim();
  return null;
}

const EXT_LANG: Record<string, BundledLanguage> = {
  ".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".jsx": "jsx",
  ".py": "python", ".rb": "ruby", ".go": "go", ".rs": "rust",
  ".java": "java", ".kt": "kotlin", ".swift": "swift",
  ".css": "css", ".scss": "scss", ".html": "html", ".htm": "html",
  ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
  ".md": "markdown", ".sh": "shell", ".bash": "shell", ".zsh": "shell",
  ".sql": "sql", ".xml": "xml", ".graphql": "graphql", ".gql": "graphql",
  ".vue": "vue", ".svelte": "svelte",
};

function languageFromPath(filePath: string): BundledLanguage {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (EXT_LANG[ext] ?? "plaintext") as any;
}

interface ArgsPreview {
  filePath: string;
  diff?: string;
  content?: string;
  language?: BundledLanguage;
}

function generateArgsPreview(
  toolName: string,
  parsedArgs: Record<string, unknown> | null,
): ArgsPreview | null {
  if (!parsedArgs || typeof parsedArgs !== "object") return null;

  const path = typeof parsedArgs.path === "string" ? parsedArgs.path : null;
  if (!path) return null;

  const local = localName(toolName);

  // string_replace_lsp → unified diff from old_string / new_string
  if (/(?:^|_)(?:string_replace_lsp)(?:_ide)?$/.test(local)) {
    const oldStr = typeof parsedArgs.old_string === "string" ? parsedArgs.old_string : null;
    const newStr = typeof parsedArgs.new_string === "string" ? parsedArgs.new_string : null;
    if (oldStr === null || newStr === null) return null;
    return { filePath: path, diff: buildUnifiedDiff(path, oldStr.split("\n"), newStr.split("\n")) };
  }

  // ast_smart_edit → show pattern → replacement as diff
  if (/(?:^|_)(?:ast_smart_edit)(?:_ide)?$/.test(local)) {
    const pattern = typeof parsedArgs.pattern === "string" ? parsedArgs.pattern : null;
    const replacement = typeof parsedArgs.replacement === "string" ? parsedArgs.replacement : null;
    if (pattern === null || replacement === null) return null;
    return { filePath: path, diff: buildUnifiedDiff(path, pattern.split("\n"), replacement.split("\n")) };
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
  const previewData = generateArgsPreview(name, toolArgs);

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
          <div className="space-y-2 overflow-hidden p-4">
            <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Diff
            </h4>
            <DiffPreview diff={previewData.diff} language={languageFromPath(previewData.filePath)} />
          </div>
        )}
        {/* write_file: show file content as code */}
        {previewData?.content && (
          <div className="space-y-2 overflow-hidden p-4">
            <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Content
            </h4>
            <CodeBlock
              language={previewData.language as BundledLanguage}
              code={previewData.content}
            />
          </div>
        )}
        {/* Non-edit tools: show args via ToolInput (has "Parameters" label) */}
        {!previewData && toolArgs && (
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
