import type { NineRouterProvider } from "../../provider.js";
import type { ChatMessage } from "../../types.js";

const SUMMARIZE_PROMPT = `You are a conversation summarizer. Summarize the following conversation into a concise paragraph preserving:
- What the user asked for
- Key decisions made
- Files modified and why
- Current state of work
- Any pending tasks or blockers

Be concise. Focus on facts, not pleasantries. Output ONLY the summary, no preamble.`;

export interface ContextCompactorConfig {
  maxHistoryTokens: number;
  preserveRecentMessages: number;
  truncateToolResultsAt: number;
}

const DEFAULT_CONFIG: ContextCompactorConfig = {
  maxHistoryTokens: 28_000,
  preserveRecentMessages: 10,
  truncateToolResultsAt: 3000,
};

export class ContextCompactor {
  private config: ContextCompactorConfig;

  constructor(
    private provider: NineRouterProvider,
    config?: Partial<ContextCompactorConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  estimateTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += estimateMessageTokens(msg);
    }
    return total;
  }

  truncateToolResults(messages: ChatMessage[]): ChatMessage[] {
    const { truncateToolResultsAt } = this.config;
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

  async compactIfNeeded(
    messages: ChatMessage[],
    model: string,
  ): Promise<ChatMessage[] | null> {
    const estimated = this.estimateTokens(messages);
    if (estimated <= this.config.maxHistoryTokens) {
      return null;
    }

    const { preserveRecentMessages } = this.config;
    const recentStart = Math.max(0, messages.length - preserveRecentMessages);
    const oldMessages = messages.slice(0, recentStart);
    const recentMessages = messages.slice(recentStart);

    if (oldMessages.length === 0) {
      return null;
    }

    try {
      const summary = await this.summarize(oldMessages, model);
      return [
        {
          role: "system",
          content: `[Previous conversation summary]\n${summary}`,
        },
        ...recentMessages,
      ];
    } catch {
      // Summarization failed — drop oldest half of old messages
      const halfOld = oldMessages.slice(Math.floor(oldMessages.length / 2));
      return [
        {
          role: "system",
          content: "[Earlier messages dropped due to context limit]",
        },
        ...halfOld,
        ...recentMessages,
      ];
    }
  }

  async compactNow(
    messages: ChatMessage[],
    model: string,
  ): Promise<ChatMessage[] | null> {
    const { preserveRecentMessages } = this.config;
    const recentStart = Math.max(0, messages.length - preserveRecentMessages);
    const oldMessages = messages.slice(0, recentStart);
    const recentMessages = messages.slice(recentStart);

    if (oldMessages.length === 0) {
      return null;
    }

    try {
      const summary = await this.summarize(oldMessages, model);
      return [
        {
          role: "system",
          content: `[Previous conversation summary]\n${summary}`,
        },
        ...recentMessages,
      ];
    } catch {
      const halfOld = oldMessages.slice(Math.floor(oldMessages.length / 2));
      return [
        {
          role: "system",
          content: "[Earlier messages dropped during manual compaction]",
        },
        ...halfOld,
        ...recentMessages,
      ];
    }
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
        const content =
          m.content.length > 2000
            ? m.content.slice(0, 2000) + "...[truncated]"
            : m.content;
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

function estimateMessageTokens(msg: ChatMessage): number {
  let total = msg.content.length;
  if (msg.toolCalls) {
    for (const tc of msg.toolCalls) {
      total += tc.function.name.length + tc.function.arguments.length + 10;
    }
  }
  return Math.ceil(total / 4);
}
