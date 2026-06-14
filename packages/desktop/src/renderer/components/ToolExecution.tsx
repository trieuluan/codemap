import { Check, Clock3, Play } from "lucide-react";

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

  return (
    <article className="tool-card">
      <div className="tool-header">
        <div className="tool-header-title">
          {status === "completed" ? (
            <Check size={14} />
          ) : status === "running" ? (
            <Play size={14} />
          ) : (
            <Clock3 size={14} />
          )}
          <span>{name}</span>
        </div>
        <div className="tool-header-meta">
          <span className={`tool-status ${status}`}>{status}</span>
          <code>{toolCallId.slice(0, 8)}</code>
        </div>
      </div>

      {preview ? (
        <section className="tool-section">
          <div className="tool-section-label">Preview</div>
          <pre className="diff-preview">{preview}</pre>
        </section>
      ) : null}

      {result ? (
        <section className="tool-section">
          <div className="tool-section-label">Result</div>
          <pre className="tool-result">{result}</pre>
        </section>
      ) : null}
    </article>
  );
}
