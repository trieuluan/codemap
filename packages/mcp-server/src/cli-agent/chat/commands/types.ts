import type { ChatMessage } from "../../types.js";
import type { ChatEntry } from "../ui/chat-terminal.js";
import type { CodeMapMcpToolClient } from "../mcp/mcp-tool-client.js";
import type { NineRouterProvider } from "../../provider.js";
import type { AutoCompactPolicy, ContextCompactionState } from "../agent/context-compactor.js";

export interface CommandContext {
  currentModel: string;
  provider: NineRouterProvider;
  reviewerModel: string;
  history: ChatMessage[];
  availableModels?: string[];
  toolClient: CodeMapMcpToolClient;
  setMessages: (updater: ChatEntry[] | ((prev: ChatEntry[]) => ChatEntry[])) => void;
  setHistory: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setInputHistory: (updater: string[] | ((prev: string[]) => string[])) => void;
  setCurrentModel: (model: string) => void;
  setBusy: (busy: boolean) => void;
  debug: boolean;
  setDebug: (debug: boolean) => void;
  debugLogFile: string | null;
  lastUserText: string | null;
  compactHistory: (onProgress?: (step: string) => void) => Promise<{ beforeMessages: number; afterMessages: number; beforeTokens: number; afterTokens: number; compacted: boolean; summaryText?: string }>;
  persistSession: () => void;
  getCompactionStatus: () => { policy: AutoCompactPolicy; state: ContextCompactionState };
  resend: () => void;
  exit: () => void;
  currentSessionId?: string;
  newSession?: () => void;
  loadSessionById?: (sessionId: string) => void;
  /** Show a running indicator in the panel while a shell command is in progress. */
  startSubprocess: (command: string) => void;
  /** Append a log line to the running subprocess indicator. */
  logSubprocess: (line: string) => void;
  /** Clear the subprocess indicator when the command finishes. */
  endSubprocess: () => void;
}

export interface Command {
  name: string;
  description: string;
  execute: (args: string, ctx: CommandContext) => void | Promise<void>;
}