import type { GatewayMode, ChatMessage } from "../../types.js";
import type { ChatEntry } from "../ui/chat-terminal.js";
import type { CodeMapMcpToolClient } from "../mcp/mcp-tool-client.js";

export interface CommandContext {
  currentModel: string;
  currentMode: GatewayMode;
  profileId: string;
  history: ChatMessage[];
  availableModels?: string[];
  toolClient: CodeMapMcpToolClient;
  setMessages: (updater: ChatEntry[] | ((prev: ChatEntry[]) => ChatEntry[])) => void;
  setHistory: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setInputHistory: (updater: string[] | ((prev: string[]) => string[])) => void;
  setCurrentModel: (model: string) => void;
  setCurrentMode: (mode: GatewayMode) => void;
  setBusy: (busy: boolean) => void;
  debug: boolean;
  setDebug: (debug: boolean) => void;
  debugLogFile: string | null;
  lastUserText: string | null;
  compactHistory: () => Promise<{ beforeMessages: number; afterMessages: number; beforeTokens: number; afterTokens: number; compacted: boolean }>;
  resend: () => void;
  exit: () => void;
}

export interface Command {
  name: string;
  description: string;
  execute: (args: string, ctx: CommandContext) => void | Promise<void>;
}