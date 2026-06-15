import { Check, Clock3, Play } from "lucide-react";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../components/ai-elements/tool.js";

interface ToolExecutionProps {
  toolCallId: string;
  name: string;
  preview?: string | null;
  result?: string | null;
}

export function ToolExecution({
  toolCallId,
  name,
  preview,
  result,
}: ToolExecutionProps) {
  const status = result ? "completed" : preview ? "running" : "queued";
  const state = result
    ? ("output-available" as const)
    : preview
      ? ("input-available" as const)
      : ("input-streaming" as const);

  return (
    <Tool className="codemap-ai-tool" defaultOpen={Boolean(preview || result)}>
      <ToolHeader
        className="codemap-tool-header"
        title={name}
        type={`tool-${name}`}
        state={state}
      />
      <div className="codemap-tool-meta">
        <span className={`tool-status ${status}`}>
          {status === "completed" ? <Check size={12} /> : status === "running" ? <Play size={12} /> : <Clock3 size={12} />}
          {status}
        </span>
        <code>{toolCallId.slice(0, 8)}</code>
      </div>
      <ToolContent>
        {preview ? <ToolInput className="codemap-tool-section" input={preview} /> : null}
        <ToolOutput className="codemap-tool-section" output={result} errorText={undefined} />
      </ToolContent>
    </Tool>
  );
}
