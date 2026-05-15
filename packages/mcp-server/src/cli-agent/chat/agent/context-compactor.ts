import type { NineRouterProvider } from "../../provider.js";
import type { ChatMessage } from "../../types.js";

function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
}

const SUMMARIZE_PROMPT = `You are a conversation summarizer. Summarize the following conversation into a concise paragraph preserving:
- What the user asked for
- Key decisions made
- Files modified and why
- Commands run and results
- Current state of work
- Any pending tasks or blockers

Be concise. Focus on facts, not pleasantries. Output ONLY the summary, no preamble.`;

export type CompactStrategy = "summarize" | "drop";
export type CompactReason = "auto_threshold" | "manual" | "fallback_drop";

export interface AutoCompactPolicy {
  enabled: boolean;
  maxContextTokens: number;
  triggerPercent: number;
  targetPercent: number;
  triggerTokens?: number;
  targetTokens?: number;
  reserveTokens: number;
  strategy: CompactStrategy;
  preserveRecentMessages: number;
  preserveRecentTokens?: number;
  minMessagesBeforeCompact: number;
  truncateToolResultsAt: number;
  preservePinned: boolean;
  maxCompactionsPerTurn: number;
  cooldownMs: number;
  summarizerMaxMessageChars: number;
  summarizerMaxTokens: number;
}

export interface ContextCompactionState {
  estimatedTokens: number;
  maxContextTokens: number;
  effectiveMaxTokens: number;
  reserveTokens: number;
  usagePercent: number;
  triggerTokens: number;
  targetTokens: number;
  compactedCount: number;
  turnCompactionCount: number;
  lastStrategy?: CompactStrategy;
  lastReason?: CompactReason;
  lastCompactedAt?: string;
  lastDroppedMessages?: number;
  lastBeforeTokens?: number;
  lastAfterTokens?: number;
  lastWarning?: string;
}

export interface ContextCompactionResult {
  messages: ChatMessage[];
  state: ContextCompactionState;
  compacted: boolean;
  warning?: string;
}

export interface ContextCompactorConfig extends Partial<AutoCompactPolicy> {
  /** @deprecated use maxContextTokens */
  maxHistoryTokens?: number;
}

export const DEFAULT_POLICY: AutoCompactPolicy = {
  enabled: true,
  maxContextTokens: 100_000,
  triggerPercent: 80,
  targetPercent: 60,
  reserveTokens: 0,
  strategy: "summarize",
  preserveRecentMessages: 10,
  minMessagesBeforeCompact: 4,
  truncateToolResultsAt: 3000,
  preservePinned: true,
  maxCompactionsPerTurn: 1,
  cooldownMs: 0,
  summarizerMaxMessageChars: 2000,
  summarizerMaxTokens: 1000,
};

export class ContextCompactor {
  private policy: AutoCompactPolicy;
  private state: ContextCompactionState;

  constructor(private provider: NineRouterProvider, config?: ContextCompactorConfig) {
    this.policy = normalizePolicy(config);
    this.state = this.createState(0);
  }

  beginTurn(): void {
    this.state = { ...this.state, turnCompactionCount: 0 };
  }

  getPolicy(): AutoCompactPolicy { return { ...this.policy }; }

  updatePolicy(config: ContextCompactorConfig): AutoCompactPolicy {
    this.policy = normalizePolicy({ ...this.policy, ...config });
    this.state = this.createState(this.state.estimatedTokens);
    return this.getPolicy();
  }

  getState(messages?: ChatMessage[]): ContextCompactionState {
    if (messages) this.state = this.createState(this.estimateTokens(messages));
    return { ...this.state };
  }

  estimateTokens(messages: ChatMessage[]): number {
    return messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0);
  }

  truncateToolResults(messages: ChatMessage[]): ChatMessage[] {
    const { truncateToolResultsAt } = this.policy;
    let changed = false;
    const result = messages.map((msg) => {
      if (msg.role !== "tool" || msg.content.length <= truncateToolResultsAt) return msg;
      changed = true;
      return { ...msg, content: `${msg.content.slice(0, truncateToolResultsAt)}\n\n[... truncated for context management]` };
    });
    return changed ? result : messages;
  }

  async maybeCompact(messages: ChatMessage[], model: string, options?: { reason?: CompactReason; force?: boolean; strategy?: CompactStrategy }): Promise<ContextCompactionResult> {
    const estimated = this.estimateTokens(messages);
    this.state = this.createState(estimated);
    const force = options?.force === true;
    if (!force && !this.shouldAutoCompact(messages, estimated)) {
      return { messages, state: this.getState(), compacted: false };
    }

    const strategy = options?.strategy ?? this.policy.strategy;
    const reason = options?.reason ?? (force ? "manual" : "auto_threshold");
    if (strategy === "drop") return this.dropToTarget(messages, reason);

    try {
      return await this.summarizeToTarget(messages, model, reason, estimated);
    } catch (err) {
      const warning = err instanceof Error ? err.message : String(err);
      const dropped = this.dropToTarget(messages, "fallback_drop", true, estimated, warning);
      return { ...dropped, warning };
    }
  }

  async compactIfNeeded(messages: ChatMessage[], model: string): Promise<ChatMessage[] | null> {
    const result = await this.maybeCompact(messages, model, { reason: "auto_threshold" });
    return result.compacted ? result.messages : null;
  }

  async compactNow(messages: ChatMessage[], model: string): Promise<ChatMessage[] | null> {
    const result = await this.maybeCompact(messages, model, { force: true, reason: "manual" });
    return result.compacted ? result.messages : null;
  }

  private shouldAutoCompact(messages: ChatMessage[], estimatedTokens: number): boolean {
    if (!this.policy.enabled) return false;
    if (messages.length < this.policy.minMessagesBeforeCompact) return false;
    if (this.state.turnCompactionCount >= this.policy.maxCompactionsPerTurn) return false;
    if (this.policy.cooldownMs > 0 && this.state.lastCompactedAt) {
      if (Date.now() - Date.parse(this.state.lastCompactedAt) < this.policy.cooldownMs) return false;
    }
    return estimatedTokens >= this.getTriggerTokens();
  }

  private async summarizeToTarget(messages: ChatMessage[], model: string, reason: CompactReason, beforeTokens: number): Promise<ContextCompactionResult> {
    const partition = this.partitionMessages(messages);
    if (partition.compactable.length === 0) return { messages, state: this.getState(messages), compacted: false };

    const summary = await this.summarize(partition.compactable, model);
    let nextMessages = this.dedupeMessages([
      ...partition.pinned,
      { role: "system", content: `[Previous conversation summary]\n${summary}` } satisfies ChatMessage,
      ...partition.recent,
    ]);
    let strategy: CompactStrategy = "summarize";
    let finalReason = reason;
    let warning: string | undefined;

    if (this.estimateTokens(nextMessages) > this.getTargetTokens()) {
      const fallback = this.dropToTarget(nextMessages, "fallback_drop", false);
      nextMessages = fallback.messages;
      strategy = "drop";
      finalReason = "fallback_drop";
      warning = "Summary compaction did not reach target; applied drop fallback.";
    }

    this.updateCompactedState(nextMessages, strategy, finalReason, partition.compactable.length, beforeTokens, warning);
    return { messages: nextMessages, state: this.getState(), compacted: true, warning };
  }

  private dropToTarget(messages: ChatMessage[], reason: CompactReason, updateState = true, beforeTokens = this.estimateTokens(messages), warning?: string): ContextCompactionResult {
    const partition = this.partitionMessages(messages);
    if (partition.compactable.length === 0) return { messages, state: this.getState(messages), compacted: false, warning };

    const targetTokens = this.getTargetTokens();
    const marker = { role: "system", content: "[Earlier messages dropped during context compaction]" } satisfies ChatMessage;
    const kept = [...partition.compactable];
    let nextMessages = this.dedupeMessages([...partition.pinned, marker, ...kept, ...partition.recent]);
    let dropped = 0;

    while (kept.length > 0 && this.estimateTokens(nextMessages) > targetTokens) {
      kept.shift();
      dropped++;
      nextMessages = this.dedupeMessages([...partition.pinned, marker, ...kept, ...partition.recent]);
    }

    const result: ContextCompactionResult = { messages: nextMessages, state: this.getState(), compacted: true, warning };
    if (updateState) this.updateCompactedState(nextMessages, "drop", reason, dropped, beforeTokens, warning);
    return result;
  }

  private partitionMessages(messages: ChatMessage[]): { pinned: ChatMessage[]; compactable: ChatMessage[]; recent: ChatMessage[] } {
    const recentStart = Math.max(0, messages.length - this.policy.preserveRecentMessages);
    const pinned: ChatMessage[] = [];
    const compactable: ChatMessage[] = [];
    const recent: ChatMessage[] = [];

    messages.forEach((message, index) => {
      if (index >= recentStart) {
        recent.push(message);
      } else if (this.policy.preservePinned && isPinnedMessage(message, index)) {
        pinned.push(message);
      } else {
        compactable.push(message);
      }
    });

    return {
      pinned: this.dedupeMessages(pinned),
      compactable,
      recent: this.dedupeMessages(recent),
    };
  }

  private dedupeMessages(messages: ChatMessage[]): ChatMessage[] {
    const seen = new Set<ChatMessage>();
    return messages.filter((msg) => {
      if (seen.has(msg)) return false;
      seen.add(msg);
      return true;
    });
  }

  private createState(estimatedTokens: number): ContextCompactionState {
    const effectiveMax = this.policy.maxContextTokens - this.policy.reserveTokens;
    return {
      estimatedTokens,
      maxContextTokens: this.policy.maxContextTokens,
      effectiveMaxTokens: effectiveMax,
      reserveTokens: this.policy.reserveTokens,
      usagePercent: Math.round((estimatedTokens / this.policy.maxContextTokens) * 100),
      triggerTokens: this.getTriggerTokens(),
      targetTokens: this.getTargetTokens(),
      compactedCount: this.state?.compactedCount ?? 0,
      turnCompactionCount: this.state?.turnCompactionCount ?? 0,
      lastStrategy: this.state?.lastStrategy,
      lastReason: this.state?.lastReason,
      lastCompactedAt: this.state?.lastCompactedAt,
      lastDroppedMessages: this.state?.lastDroppedMessages,
      lastBeforeTokens: this.state?.lastBeforeTokens,
      lastAfterTokens: this.state?.lastAfterTokens,
      lastWarning: this.state?.lastWarning,
    };
  }

  private updateCompactedState(messages: ChatMessage[], strategy: CompactStrategy, reason: CompactReason, droppedMessages: number, beforeTokens: number, warning?: string): void {
    const afterTokens = this.estimateTokens(messages);
    this.state = {
      ...this.createState(afterTokens),
      compactedCount: (this.state?.compactedCount ?? 0) + 1,
      turnCompactionCount: (this.state?.turnCompactionCount ?? 0) + 1,
      lastStrategy: strategy,
      lastReason: reason,
      lastCompactedAt: new Date().toISOString(),
      lastDroppedMessages: droppedMessages,
      lastBeforeTokens: beforeTokens,
      lastAfterTokens: afterTokens,
      lastWarning: warning,
    };
  }

  private async summarize(messages: ChatMessage[], model: string): Promise<string> {
    const conversation = messages.map((m) => {
      const prefix = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : m.role === "tool" ? `Tool(${m.name ?? "?"})` : "System";
      const content = stripAnsi(
        m.content.length > this.policy.summarizerMaxMessageChars
          ? m.content.slice(0, this.policy.summarizerMaxMessageChars) + "...[truncated]"
          : m.content
      );
      return `${prefix}: ${content}`;
    }).join("\n\n");

    const result = await this.provider.complete({
      model,
      system: SUMMARIZE_PROMPT,
      messages: [{ role: "user", content: conversation }],
      temperature: 0.3,
      maxTokens: this.policy.summarizerMaxTokens,
    });

    return result.text;
  }

  private getTriggerTokens(): number {
    if (this.policy.triggerTokens != null) return Math.max(1, Math.min(this.policy.triggerTokens, this.policy.maxContextTokens));
    const percent = Math.max(1, Math.min(this.policy.triggerPercent, 100));
    return Math.floor(this.policy.maxContextTokens * (percent / 100));
  }

  private getTargetTokens(): number {
    if (this.policy.targetTokens != null) return Math.max(1, Math.min(this.policy.targetTokens, this.getTriggerTokens() - 1));
    const percent = Math.max(1, Math.min(this.policy.targetPercent, this.policy.triggerPercent - 1));
    return Math.floor(this.policy.maxContextTokens * (percent / 100));
  }
}

function normalizePolicy(config?: ContextCompactorConfig): AutoCompactPolicy {
  const maxContextTokens = config?.maxContextTokens ?? config?.maxHistoryTokens;
  const policy = { ...DEFAULT_POLICY, ...config, ...(maxContextTokens ? { maxContextTokens } : {}) };

  const triggerPercent = clampPercent(policy.triggerPercent, DEFAULT_POLICY.triggerPercent);
  const targetPercent = Math.min(clampPercent(policy.targetPercent, DEFAULT_POLICY.targetPercent), triggerPercent - 1);

  return {
    enabled: Boolean(policy.enabled),
    maxContextTokens: Math.max(1, Math.floor(policy.maxContextTokens)),
    triggerPercent,
    targetPercent: Math.max(1, targetPercent),
    triggerTokens: policy.triggerTokens != null ? Math.max(1, Math.floor(policy.triggerTokens)) : undefined,
    targetTokens: policy.targetTokens != null ? Math.max(1, Math.floor(policy.targetTokens)) : undefined,
    reserveTokens: Math.max(0, Math.floor(policy.reserveTokens)),
    strategy: policy.strategy === "drop" ? "drop" : "summarize",
    preserveRecentMessages: Math.max(0, Math.floor(policy.preserveRecentMessages)),
    preserveRecentTokens: policy.preserveRecentTokens != null ? Math.max(0, Math.floor(policy.preserveRecentTokens)) : undefined,
    minMessagesBeforeCompact: Math.max(0, Math.floor(policy.minMessagesBeforeCompact)),
    truncateToolResultsAt: Math.max(500, Math.floor(policy.truncateToolResultsAt)),
    preservePinned: Boolean(policy.preservePinned),
    maxCompactionsPerTurn: Math.max(1, Math.floor(policy.maxCompactionsPerTurn)),
    cooldownMs: Math.max(0, Math.floor(policy.cooldownMs)),
    summarizerMaxMessageChars: Math.max(500, Math.floor(policy.summarizerMaxMessageChars)),
    summarizerMaxTokens: Math.max(100, Math.floor(policy.summarizerMaxTokens)),
  };
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

function isPinnedMessage(message: ChatMessage, index: number): boolean {
  if (message.role === "system") return true;
  if (index === 0 && message.role === "user") return true;
  if (message.content.includes("[Previous conversation summary]")) return true;
  return false;
}

function estimateMessageTokens(msg: ChatMessage): number {
  let total = msg.content.length;
  if (msg.toolCalls) {
    for (const tc of msg.toolCalls) {
      total += tc.function.name.length + tc.function.arguments.length + 10;
    }
  }
  return Math.ceil(total / 4);
}