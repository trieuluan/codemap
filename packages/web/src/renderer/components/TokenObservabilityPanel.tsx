import { encode } from "gpt-tokenizer/encoding/o200k_base";
import type { SessionMessage, SessionSnapshot } from "@codemap-ai/core/agent/contracts";

interface TokenObservabilityPanelProps {
  snapshot: SessionSnapshot;
  contextLimit?: number;
}

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

interface AttributionBreakdown {
  categories: TokenCategory[];
  total: number;
}

const fileToolPattern = /(file|read|search|find|symbol|explore|project|related)/i;

// Cumulative thread-level tokenUsage can reach tens of millions — any value above
// this is not a meaningful per-request context size and should be ignored.
const MAX_REASONABLE_CONTEXT = 1_000_000;

// Strip base64 image data before tokenizing — images are not text tokens
function stripInlineImages(content: string): string {
  return content.replace(/!\[[^\]]*\]\(data:image\/[^;]+;base64,[^)]+\)/g, "[image]");
}

function countTokens(text: string | undefined): number {
  if (!text) return 0;
  return encode(stripInlineImages(text)).length;
}

function collectHistoricalToolWeights(messages: SessionMessage[]) {
  const toolsById = new Map<string, { name: string; args: string; result: string }>();

  for (const message of messages) {
    if (!message.toolCallId || !message.name) continue;

    const existing = toolsById.get(message.toolCallId) ?? {
      name: message.name,
      args: "",
      result: "",
    };

    if (message.role === "tool_call") {
      existing.args = typeof message.content === "string" ? message.content : existing.args;
    }

    if (message.role === "tool") {
      existing.result = typeof message.content === "string" ? message.content : existing.result;
    }

    toolsById.set(message.toolCallId, existing);
  }

  return [...toolsById.values()].reduce(
    (weights, tool) => {
      const weight = countTokens(tool.name) + countTokens(tool.args) + countTokens(tool.result);
      weights[fileToolPattern.test(tool.name) ? "files" : "tools"] += weight;
      return weights;
    },
    { files: 0, tools: 0 },
  );
}

/**
 * Build BPE-estimated category weights from snapshot content.
 * Returns raw unscaled token counts per category.
 */
function buildCategoryWeights(snapshot: SessionSnapshot) {
  // Prefer snapshot.systemPrompt (set from agentInstructions on thread_change).
  // Fall back to any system-role messages in the thread as a secondary source.
  const systemFromPrompt = countTokens(snapshot.systemPrompt ?? "");
  const systemFromMessages = snapshot.messages
    .filter((m) => m.role === "system")
    .reduce((total, m) => total + countTokens(typeof m.content === "string" ? m.content : ""), 0);
  const systemWeight = systemFromPrompt > 0 ? systemFromPrompt : systemFromMessages;

  const historyWeight = snapshot.messages
    .filter((m) => m.role !== "system" && m.role !== "tool" && m.role !== "tool_call")
    .reduce((total, m) => total + countTokens(typeof m.content === "string" ? m.content : ""), 0);

  const liveToolWeights = snapshot.tools.reduce(
    (weights, tool) => {
      const weight = countTokens(tool.name) + countTokens(tool.args) + countTokens(tool.result);
      weights[fileToolPattern.test(tool.name) ? "files" : "tools"] += weight;
      return weights;
    },
    { files: 0, tools: 0 },
  );

  const historicalToolWeights = snapshot.tools.length === 0
    ? collectHistoricalToolWeights(snapshot.messages)
    : { files: 0, tools: 0 };

  const reasoningWeight = countTokens(snapshot.thinkingText);

  return {
    system: systemWeight,
    tools: liveToolWeights.tools + historicalToolWeights.tools,
    files: liveToolWeights.files + historicalToolWeights.files,
    history: historyWeight,
    reasoning: reasoningWeight,
  };
}

/**
 * Scale a set of weights proportionally to a target total.
 * Assigns any integer rounding remainder to the history bucket.
 */
function scaleWeightsToTotal(
  weights: { system: number; tools: number; files: number; history: number; reasoning: number },
  target: number,
): TokenCategory[] {
  const entries: [TokenCategory["key"], string, number][] = [
    ["system", "System", weights.system],
    ["tools", "Tools", weights.tools],
    ["files", "Files", weights.files],
    ["history", "History", weights.history],
    ["reasoning", "Reasoning", weights.reasoning],
  ];

  const totalWeight = entries.reduce((sum, [, , w]) => sum + w, 0);

  if (totalWeight === 0) {
    // No content — put everything in history
    return entries.map(([key, label, ], i) => ({
      key,
      label,
      tokens: i === 3 ? target : 0, // history is index 3
    }));
  }

  const scaled = entries.map(([key, label, w]) => ({
    key,
    label,
    tokens: Math.floor((Math.max(w, 0) / totalWeight) * target),
  }));

  // Assign rounding remainder to history
  const remainder = target - scaled.reduce((sum, c) => sum + c.tokens, 0);
  const historyCategory = scaled.find((c) => c.key === "history");
  if (historyCategory) historyCategory.tokens += remainder;

  return scaled;
}

export function estimateAttribution(snapshot: SessionSnapshot): TokenCategory[] {
  return estimateCurrentContext(snapshot).categories;
}

/**
 * Current context estimate — the effective prompt size for the latest request.
 *
 * When RUNNING: uses `snapshot.usage.promptTokens` (real provider data for this turn).
 * When IDLE: uses BPE estimate from loaded messages as-is — no scaling, no cap.
 *   The BPE number may exceed contextLimit; that is expected and honest.
 */
export function estimateCurrentContext(snapshot: SessionSnapshot): AttributionBreakdown {
  const weights = buildCategoryWeights(snapshot);
  const bpeTotal = Object.values(weights).reduce((sum, w) => sum + w, 0);

  // Prefer promptTokens (actual tokens sent to provider this turn)
  // Fall back to totalTokens only if promptTokens unavailable
  // Ignore cumulative totals > MAX_REASONABLE_CONTEXT
  const { promptTokens, totalTokens } = snapshot.usage;
  let used: number;
  if (promptTokens > 0 && promptTokens <= MAX_REASONABLE_CONTEXT) {
    used = promptTokens;
  } else if (totalTokens > 0 && totalTokens <= MAX_REASONABLE_CONTEXT) {
    used = totalTokens;
  } else {
    // IDLE — no real usage data. Use BPE estimate as-is.
    // Do NOT cap to contextLimit: scaling BPE down to limit is fabrication.
    used = bpeTotal;
  }

  if (used === 0) {
    return {
      categories: [
        { key: "system", label: "System", tokens: 0 },
        { key: "tools", label: "Tools", tokens: 0 },
        { key: "files", label: "Files", tokens: 0 },
        { key: "history", label: "History", tokens: 0 },
        { key: "reasoning", label: "Reasoning", tokens: 0 },
      ],
      total: 0,
    };
  }

  return { categories: scaleWeightsToTotal(weights, used), total: used };
}

/**
 * Raw thread attribution — cumulative token cost across the full thread.
 *
 * Uses `snapshot.threadUsage.totalTokens` when available (real accumulated total),
 * otherwise falls back to BPE estimate from loaded messages.
 * Not capped — shows historical scale.
 */
export function estimateRawThreadAttribution(snapshot: SessionSnapshot): AttributionBreakdown {
  const weights = buildCategoryWeights(snapshot);
  const bpeTotal = Object.values(weights).reduce((sum, w) => sum + w, 0);

  // Use real thread total if available — this is the actual cumulative usage
  const threadTotal = snapshot.threadUsage?.totalTokens ?? 0;
  const total = threadTotal > 0 ? threadTotal : bpeTotal;

  if (total === 0) {
    return {
      categories: [
        { key: "system", label: "System", tokens: 0 },
        { key: "tools", label: "Tools", tokens: 0 },
        { key: "files", label: "Files", tokens: 0 },
        { key: "history", label: "History", tokens: 0 },
        { key: "reasoning", label: "Reasoning", tokens: 0 },
      ],
      total: 0,
    };
  }

  return { categories: scaleWeightsToTotal(weights, total), total };
}

function AttributionSection({
  title,
  subtitle,
  categories,
  total,
  limit,
  capped,
}: {
  title: string;
  subtitle: string;
  categories: TokenCategory[];
  total: number;
  limit?: number;
  capped?: boolean;
}) {
  const hasLimit = typeof limit === "number" && limit > 0;
  const displayTotal = capped && hasLimit ? Math.min(total, limit) : total;
  const usagePercent = hasLimit ? Math.min(Math.round((displayTotal / limit) * 100), 100) : null;
  const barTotal = capped && hasLimit ? limit : Math.max(total, 1);

  return (
    <div className="token-section">
      <header className="xp-panel-head">
        <div className="xp-head-title">
          <div>
            <strong>{title}</strong>
            <span className="xp-head-sub">{subtitle}</span>
          </div>
        </div>
        <div className="token-head-value">
          <strong>
            {hasLimit
              ? `${formatTokens(displayTotal)} / ${formatTokens(limit)}`
              : `${formatTokens(displayTotal)} total`}
          </strong>
          {usagePercent !== null && <span className="token-pct">{usagePercent}% used</span>}
        </div>
      </header>

      <div
        className="token-bar"
        aria-label={
          hasLimit
            ? `${usagePercent}% of context used`
            : `${formatTokens(displayTotal)} total thread attribution`
        }
      >
        {categories.map((category) => (
          <span
            className={`token-seg ${category.key}`}
            key={category.key}
            style={{ width: `${barTotal > 0 ? (category.tokens / barTotal) * 100 : 0}%` }}
          />
        ))}
        {capped && hasLimit && displayTotal < limit && (
          <span className="token-seg free" style={{ width: `${((limit - displayTotal) / limit) * 100}%` }} />
        )}
      </div>

      <ul className="token-legend">
        {categories
          .filter((category) => category.tokens > 0)
          .map((category) => (
            <li className="token-legend-row" key={category.key}>
              <span className={`token-swatch ${category.key}`} />
              <span className="token-legend-label">{category.label}</span>
              <code className="token-legend-value">{formatTokens(category.tokens)}</code>
            </li>
          ))}
      </ul>
    </div>
  );
}

export function TokenObservabilityPanel({ snapshot, contextLimit }: TokenObservabilityPanelProps) {
  const currentContext = estimateCurrentContext(snapshot);
  const rawThreadAttribution = estimateRawThreadAttribution(snapshot);

  // Only show context limit when we have real provider usage (running turn).
  // When idle, promptTokens=0 so BPE estimate is shown as-is without a limit bar.
  const { promptTokens, totalTokens } = snapshot.usage;
  const hasRealUsage =
    (promptTokens > 0 && promptTokens <= MAX_REASONABLE_CONTEXT) ||
    (totalTokens > 0 && totalTokens <= MAX_REASONABLE_CONTEXT);

  const modelStatus =
    snapshot.status === "running" || snapshot.status === "aborting"
      ? "running"
      : snapshot.status === "error" || snapshot.status === "disconnected"
        ? "active"
        : "done";

  return (
    <section className="context-panel" aria-label="Context observability">
      <div className="context-sections">
        <AttributionSection
          title="Current context estimate"
          subtitle={hasRealUsage ? "effective prompt after compaction" : "estimated from loaded messages"}
          categories={currentContext.categories}
          total={currentContext.total}
          limit={hasRealUsage ? contextLimit : undefined}
          capped={hasRealUsage}
        />

        <AttributionSection
          title="Raw thread attribution"
          subtitle="historical cumulative attribution"
          categories={rawThreadAttribution.categories}
          total={rawThreadAttribution.total}
        />
      </div>

      <div className="token-tree">
        <div className="token-tree-head">
          <span>Execution tree</span>
          <span className="token-pill">{snapshot.tools.length} tools</span>
        </div>

        <div className="token-tree-row">
          <span className="token-tree-mark">
            <span className={`token-tree-dot ${modelStatus}`} />
          </span>
          <span>
            <strong className="token-tree-name">{snapshot.model ?? "Model session"}</strong>
            <small className="token-tree-role">model</small>
          </span>
          <span className="token-tree-role">{snapshot.status}</span>
          <code className="token-tree-tokens">
            {snapshot.usage.totalTokens > 0 && snapshot.usage.totalTokens <= MAX_REASONABLE_CONTEXT
              ? formatTokens(snapshot.usage.totalTokens)
              : "—"}
          </code>
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
              <span className="token-tree-role">{status}</span>
              <code className="token-tree-tokens">
                {formatTokens(countTokens(tool.args) + countTokens(tool.result))}
              </code>
            </div>
          );
        })}

        {snapshot.tools.length === 0 && (
          <p className="token-tree-empty">Tool calls will appear here as the session runs.</p>
        )}

        {snapshot.threadUsage && snapshot.threadUsage.totalTokens > 0 && (
          <div className="token-thread-usage">
            <span>Thread total</span>
            <code>{formatTokens(snapshot.threadUsage.totalTokens)}</code>
          </div>
        )}
      </div>
    </section>
  );
}
