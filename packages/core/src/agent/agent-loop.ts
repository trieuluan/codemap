import type { ChatMessage, TokenUsage } from "./types.ts";

export interface AgentLoopResult {
  text: string;
  messages: ChatMessage[];
  usedTools: boolean;
  unsupportedToolCalling: boolean;
  usage?: TokenUsage;
}

export type CancelTaskStreamFn = (reason?: string) => void;
