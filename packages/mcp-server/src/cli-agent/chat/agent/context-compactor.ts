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
  strategy: CompactStrategy;
  preserveRecentMessages: number;
  truncateToolResultsAt: number;
  preservePinned: boolean;
  maxCompactionsPerTurn: number;
}

export interface ContextCompactionState {
  estimatedTokens: number;
  maxContextTokens: number;
  usagePercent: number;
  compactedCount: number;
  lastStrategy?: CompactStrategy;
  lastReason?: CompactReason;
  lastCompactedAt?: string;
  lastDroppedMessages?: number;
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

const DEFAULT_POLICY: AutoCompactPolicy = {
  enabled: true,
  maxContextTokens: 28_000,
  triggerPercent: 80,
  targetPercent: 60,
  strategy: "summarize",
  preserveRecentMessages: 10,
  truncateToolResultsAt: 3000,
  preservePinned: true,
  maxCompactionsPerTurn: 1,
};

export class ContextCompactor {
  private policy: AutoCompactPolicy;
  private state: ContextCompactionState;

  constructor(
    private provider: NineRouterProvider,
    config?: ContextCompactorConfig,
  ) {
    this.policy = normalizePolicy(config);
    this.state = this.createState(0);
  }

  getPolicy(): AutoCompactPolicy {
    return { ...this.policy };
  }

  updatePolicy(config: ContextCompactorConfig): AutoCompactPolicy {
    this.policy = normalizePolicy({ ...this.policy, ...config });
    this.state = this.createState(this.state.estimatedTokens);
    return this.getPolicy();
  }

  getState(messages?: ChatMessage[]): ContextCompactionState {
    if (messages) {
      this.state = this.createState(this.estimateTokens(messages));
    }
    return { ...this.state };
  }

  estimateTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += estimateMessageTokens(msg);
    }
    return total;
  }

  truncateToolResults(messages: ChatMessage[]): ChatMessage[] {
    const { truncateToolResultsAt } = this.policy;
    let changed = false;
    const result: ChatMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "tool" && msg.content.length > truncateToolResultsAt) {
        changed = true;
        result.push({
          ...msg,
          content:
            msg.content.slice(0, truncateToolResultsAt) +
            "\n\n[... truncated for context management]",
        });
      } else {
        result.push(msg);
      }
    }

    return changed ? result : messages;
  }

  async maybeCompact(
    messages: ChatMessage[],
    model: string,
    options?: { reason?: CompactReason; force?: boolean; strategy?: CompactStrategy },
  ): Promise<ContextCompactionResult> {
    const estimated = this.estimateTokens(messages);
    this.state = this.createState(estimated);

    const shouldCompact =
      options?.force === true ||
      (this.policy.enabled && this.state.usagePercent >= this.policy.triggerPercent);

    if (!shouldCompact) {
      return { messages, state: this.getState(), compacted: false };
    }

    const strategy = options?.strategy ?? this.policy.strategy;
    const reason = options?.reason ?? (options?.force ? "manual" : "auto_threshold");

    if (strategy === "drop") {
      return this.dropToTarget(messages, reason);
    }

    try {
      return await this.summarizeToTarget(messages, model, reason);
    } catch (err) {
      const dropped = this.dropToTarget(messages, "fallback_drop");
      return {
        ...dropped,
        warning: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async compactIfNeeded(
    messages: ChatMessage[],
    model: string,
  ): Promise<ChatMessage[] | null> {
    const result = await this.maybeCompact(messages, model, { reason: "auto_threshold" });
    return result.compacted ? result.messages : null;
  }

  async compactNow(
    messages: ChatMessage[],
    model: string,
  ): Promise<ChatMessage[] | null> {
    const result = await this.maybeCompact(messages, model, {
      force: true,
      reason: "manual",
    });
    return result.compacted ? result.messages : null;
  }

  private async summarizeToTarget(
    messages: ChatMessage[],
    model: string,
    reason: CompactReason,
  ): Promise<ContextCompactionResult> {
    const partition = this.partitionMessages(messages);
    if (partition.compactable.length === 0) {
      return { messages, state: this.getState(messages), compacted: false };
    }

    const summary = await this.summarize(partition.compactable, model);
    const nextMessages = this.dedupeMessages([
      ...partition.pinned,
      {
        role: "system",
        content: `[Previous conversation summary]\n${summary}`,
      } satisfies ChatMessage,
      ...partition.recent,
    ]);

    this.updateCompactedState(nextMessages, "summarize", reason, partition.compactable.length);
    return { messages: nextMessages, state: this.getState(), compacted: true };
  }

  private dropToTarget(
    messages: ChatMessage[],
    reason: CompactReason,
  ): ContextCompactionResult {
    const partition = this.partitionMessages(messages);
    if (partition.compactable.length === 0) {
      return { messages, state: this.getState(messages), compacted: false };
    }

    const targetTokens = Math.floor(
      this.policy.maxContextTokens * (this.policy.targetPercent / 100),
    );
    const keptCompactable = [...partition.compactable];
    let nextMessages = this.dedupeMessages([
      ...partition.pinned,
      {
        role: "system",
        content: "[Earlier messages dropped during context compaction]",
      } satisfies ChatMessage,
      ...keptCompactable,
      ...partition.recent,
    ]);

    let dropped = 0;
    while (keptCompactable.length > 0 && this.estimateTokens(nextMessages) > targetTokens) {
      keptCompactable.shift();
      dropped += 1;
      nextMessages = this.dedupeMessages([
        ...partition.pinned,
        {
          role: "system",
          content: "[Earlier messages dropped during context compaction]",
        } satisfies ChatMessage,
        ...keptCompactable,
        ...partition.recent,
      ]);
    }

    this.updateCompactedState(nextMessages, "drop", reason, dropped);
    return { messages: nextMessages, state: this.getState(), compacted: true };
  }

  private partitionMessages(messages: ChatMessage[]): {
    pinned: ChatMessage[];
    compactable: ChatMessage[];
    recent: ChatMessage[];
  } {
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
    const result: ChatMessage[] = [];
    for (const message of messages) {
      if (!seen.has(message)) {
        seen.add(message);
        result.push(message);
      }
    }
    return result;
  }

  private createState(estimatedTokens: number): ContextCompactionState {
    return {
      ...this.state,
      estimatedTokens,
      maxContextTokens: this.policy.maxContextTokens,
      usagePercent: Math.round((estimatedTokens / this.policy.maxContextTokens) * 100),
      compactedCount: this.state?.compactedCount ?? 0,
    };
  }

  private updateCompactedState(
    messages: ChatMessage[],
    strategy: CompactStrategy,
    reason: CompactReason,
    droppedMessages: number,
  ): void {
    const previousCount = this.state.compactedCount;
    this.state = {
      ...this.createState(this.estimateTokens(messages)),
      compactedCount: previousCount + 1,
      lastStrategy: strategy,
      lastReason: reason,
      lastCompactedAt: new Date().toISOString(),
      lastDroppedMessages: droppedMessages,
    };
  }

  private async summarize(
    messages: ChatMessage[],
    model: string,
  ): Promise<string> {
    const conversation = messages
      .map((m) => {
        const prefix =
          m.role === "user"
            ? "User"
            : m.role === "assistant"
              ? "Assistant"
              : m.role === "tool"
                ? `Tool(${m.name ?? "?"})`
                : "System";
        const content = stripAnsi(
          m.content.length > 2000
            ? m.content.slice(0, 2000) + "...[truncated]"
            : m.content,
        );
        return `${prefix}: ${content}`;
      })
      .join("\n\n");

    const result = await this.provider.complete({
      model,
      system: SUMMARIZE_PROMPT,
      messages: [{ role: "user", content: conversation }],
      temperature: 0.3,
      maxTokens: 1000,
    });

    return result.text;
  }
}

function normalizePolicy(config?: ContextCompactorConfig): AutoCompactPolicy {
  const maxContextTokens = config?.maxContextTokens ?? config?.maxHistoryTokens;
  const policy = {
    ...DEFAULT_POLICY,
    ...config,
    ...(maxContextTokens ? { maxContextTokens } : {}),
  };

  const triggerPercent = clampPercent(policy.triggerPercent, DEFAULT_POLICY.triggerPercent);
  const targetPercent = Math.min(
    clampPercent(policy.targetPercent, DEFAULT_POLICY.targetPercent),
    triggerPercent - 1,
  );

  return {
    enabled: Boolean(policy.enabled),
    maxContextTokens: Math.max(1, Math.floor(policy.maxContextTokens)),
    triggerPercent,
    targetPercent: Math.max(1, targetPercent),
    strategy: policy.strategy === "drop" ? "drop" : "summarize",
    preserveRecentMessages: Math.max(0, Math.floor(policy.preserveRecentMessages)),
    truncateToolResultsAt: Math.max(500, Math.floor(policy.truncateToolResultsAt)),
    preservePinned: Boolean(policy.preservePinned),
    maxCompactionsPerTurn: Math.max(1, Math.floor(policy.maxCompactionsPerTurn)),
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
