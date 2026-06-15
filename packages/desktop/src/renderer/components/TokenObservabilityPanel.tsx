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

interface TokenCategory {
  key: "system" | "tools" | "files" | "history" | "reasoning";
  label: string;
  tokens: number;
}

const fileToolPattern = /(file|read|search|find|symbol|explore|project|related)/i;

function contentTokens(content: string | undefined) {
  return content ? Math.ceil(content.length / 4) : 0;
}

function estimateAttribution(snapshot: SessionSnapshot, used: number): TokenCategory[] {
  const systemWeight = snapshot.messages
    .filter((message) => message.role === "system")
    .reduce((total, message) => total + contentTokens(message.content), 0);
  const historyWeight = snapshot.messages
    .filter((message) => message.role !== "system" && message.role !== "tool")
    .reduce((total, message) => total + contentTokens(message.content), 0);
  const toolWeights = snapshot.tools.reduce(
    (weights, tool) => {
      const weight = contentTokens(tool.name) + contentTokens(tool.args) + contentTokens(tool.result);
      weights[fileToolPattern.test(tool.name) ? "files" : "tools"] += weight;
      return weights;
    },
    { files: 0, tools: 0 },
  );
  const reasoningWeight = contentTokens(snapshot.thinkingText) + snapshot.usage.completionTokens;
  const weights = [
    Math.max(systemWeight, used > 0 ? 1 : 0),
    Math.max(toolWeights.tools, used > 0 ? 1 : 0),
    Math.max(toolWeights.files, used > 0 ? 1 : 0),
    Math.max(historyWeight, used > 0 ? 1 : 0),
    Math.max(reasoningWeight, used > 0 ? 1 : 0),
  ];
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const values = weights.map((weight) => totalWeight > 0 ? Math.floor((weight / totalWeight) * used) : 0);
  const remainder = used - values.reduce((total, value) => total + value, 0);
  values[3] += remainder;

  return [
    { key: "system", label: "System", tokens: values[0] },
    { key: "tools", label: "Tools", tokens: values[1] },
    { key: "files", label: "Files", tokens: values[2] },
    { key: "history", label: "History", tokens: values[3] },
    { key: "reasoning", label: "Reasoning", tokens: values[4] },
  ];
}

export function TokenObservabilityPanel({ snapshot }: TokenObservabilityPanelProps) {
  const used = Math.min(snapshot.usage.totalTokens, contextLimit);
  const available = contextLimit - used;
  const usagePercent = Math.round((used / contextLimit) * 100);
  const categories = estimateAttribution(snapshot, used);
  const modelStatus = snapshot.status === "running" || snapshot.status === "aborting"
    ? "running"
    : snapshot.status === "error" || snapshot.status === "disconnected"
      ? "active"
      : "done";

  return (
    <section className="context-panel" aria-label="Context observability">
      <header className="xp-panel-head">
        <div className="xp-head-title">
          <span className={`xp-dot ${snapshot.status}`} />
          <div>
            <strong>Context window</strong>
            <span className="xp-head-sub">estimated attribution</span>
          </div>
        </div>
        <div className="token-head-value">
          <strong>{formatTokens(used)} / 64k</strong>
          <span className="token-pct">{usagePercent}% used</span>
        </div>
      </header>

      <div className="token-bar" aria-label={`${usagePercent}% of context used`}>
        {categories.map((category) => (
          <span
            className={`token-seg ${category.key}`}
            key={category.key}
            style={{ width: `${(category.tokens / contextLimit) * 100}%` }}
          />
        ))}
        <span className="token-seg free" style={{ width: `${(available / contextLimit) * 100}%` }} />
      </div>

      <div className="token-legend">
        {categories.map((category) => (
          <div className="token-legend-row" key={category.key}>
            <span className={`token-swatch ${category.key}`} />
            <span className="token-legend-label">{category.label}</span>
            <code>{formatTokens(category.tokens)}</code>
          </div>
        ))}
      </div>

      <div className="token-tree">
        <div className="token-tree-head">
          <span>Execution tree</span>
          <span className="token-pill">{snapshot.tools.length} tools</span>
        </div>

        <div className="token-tree-row">
          <span className="token-tree-mark"><span className={`token-tree-dot ${modelStatus}`} /></span>
          <span>
            <strong className="token-tree-name">{snapshot.model ?? "Model session"}</strong>
            <small className="token-tree-role">model</small>
          </span>
          <span className="token-tree-role">{snapshot.status}</span>
          <code className="token-tree-tokens">{formatTokens(snapshot.usage.totalTokens)}</code>
        </div>

        {snapshot.tools.map((tool) => {
          const status = tool.isError ? "active" : tool.result !== undefined ? "done" : "running";
          return (
            <div className="token-tree-row depth-1" key={tool.toolCallId}>
              <span className="token-tree-mark">
                <span className="token-tree-branch" />
                <span className={`token-tree-dot ${status}`} />
              </span>
              <span>
                <strong className="token-tree-name">{tool.name}</strong>
                <small className="token-tree-role">tool</small>
              </span>
              <span className="token-tree-role">
                {tool.isError ? "error" : tool.result !== undefined ? "done" : "running"}
              </span>
              <code className="token-tree-tokens">—</code>
            </div>
          );
        })}

        {snapshot.tools.length === 0 && (
          <p className="token-tree-empty">Tool calls will appear here as the session runs.</p>
        )}
      </div>
    </section>
  );
}
