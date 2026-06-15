import type { SessionSnapshot } from "@codemap-ai/core/agent/contracts";

interface TokenObservabilityPanelProps {
  snapshot: SessionSnapshot;
}

const contextLimit = 64_000;

function formatTokens(value: number) {
  return new Intl.NumberFormat("en", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function TokenObservabilityPanel({ snapshot }: TokenObservabilityPanelProps) {
  const used = Math.min(snapshot.usage.totalTokens, contextLimit);
  const promptWidth = `${Math.min((snapshot.usage.promptTokens / contextLimit) * 100, 100)}%`;
  const completionWidth = `${Math.min((snapshot.usage.completionTokens / contextLimit) * 100, 100)}%`;

  return (
    <section className="flex flex-col min-h-0 p-4 overflow-y-auto" aria-label="Context observability">
      <header className="flex items-start justify-between gap-3 mb-4">
        <div><h2 className="text-sm font-semibold text-foreground">Context</h2><p className="text-xs text-muted-foreground mt-0.5">Token usage and tool execution</p></div>
        <strong className="flex-shrink-0 text-sm text-foreground">{formatTokens(used)} / 64k</strong>
      </header>

      <div className="grid gap-2.5 mb-4">
        <div className="flex h-1.5 rounded-full token-meter-bar">
          <i className="prompt" style={{ width: promptWidth }} />
          <i className="completion" style={{ width: completionWidth }} />
        </div>
        <div className="grid gap-1.5 p-2.5 border border-border rounded-lg token-breakdown">
          <span className="flex items-center gap-1.5"><i className="prompt" />Prompt <strong className="ml-auto font-mono text-[11px] text-secondary-foreground">{formatTokens(snapshot.usage.promptTokens)}</strong></span>
          <span className="flex items-center gap-1.5"><i className="completion" />Completion <strong className="ml-auto font-mono text-[11px] text-secondary-foreground">{formatTokens(snapshot.usage.completionTokens)}</strong></span>
          <span className="flex items-center gap-1.5"><i className="free" />Available <strong className="ml-auto font-mono text-[11px] text-secondary-foreground">{formatTokens(contextLimit - used)}</strong></span>
        </div>
      </div>

      <div className="grid gap-1 p-3 tool-tree">
        <div className="grid gap-2 p-3 tool-tree-root">
          <span className="tool-tree-branch" />
          <div><strong className="text-xs text-foreground">Model session</strong><small className="text-[11px] text-muted-foreground block mt-0.5">{snapshot.model ?? "Default model"}</small></div>
          <b className="text-[11px] font-medium text-muted-foreground capitalize self-start mt-0.5">{formatTokens(snapshot.usage.totalTokens)}</b>
        </div>
        {snapshot.tools.length > 0 ? snapshot.tools.map((tool) => (
          <div className="grid gap-1.5 pl-4 border-l border-border tool-tree-item" key={tool.toolCallId}>
            <span className="tool-tree-branch" />
            <div>
              <strong className="text-xs text-foreground">{tool.name}</strong>
              <small className="text-[11px] text-muted-foreground block mt-0.5">{tool.preview || (tool.isError ? "Tool failed" : tool.result !== undefined ? "Completed" : "Running")}</small>
            </div>
            <b className="text-[11px] font-medium text-muted-foreground capitalize self-start mt-0.5">{tool.isError ? "error" : tool.result !== undefined ? "done" : "live"}</b>
          </div>
        )) : <div className="p-3 text-muted-foreground text-xs text-center tool-tree-empty">Tool calls will appear here as the session runs.</div>}
      </div>
    </section>
  );
}
