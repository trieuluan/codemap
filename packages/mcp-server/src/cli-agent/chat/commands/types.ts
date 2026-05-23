import type { ChatEntry } from "../ui/chat-terminal.js";
import type { CodeMapMcpToolClient } from "../mcp/mcp-tool-client.js";
import type { NineRouterProvider } from "../../provider.js";

export interface CommandContext {
  currentModel: string;
  provider: NineRouterProvider;
  reviewerModel: string;
  coderModel: string;
  plannerModel: string;
  availableModels?: string[];
  toolClient: CodeMapMcpToolClient;
  getMessages: () => ChatEntry[];
  appendMessage: (msg: Partial<ChatEntry> & { role: string; content: string }) => void;
  setMessages: (updater: ChatEntry[] | ((prev: ChatEntry[]) => ChatEntry[])) => void;
  setInputHistory: (updater: string[] | ((prev: string[]) => string[])) => void;
  setCurrentModel: (model: string) => void;
  setBusy: (busy: boolean) => void;
  debug: boolean;
  setDebug: (debug: boolean) => void;
  debugLogFile: string | null;
  lastUserText: string | null;
  persistSession: () => void;
  getSessionTokens: () => number;
  resend: () => void;
  exit: () => void;
  newSession?: () => void;
  getMastraThreadId?: () => string | null;
  loadThreadById?: (threadId: string) => Promise<void>;
  /** Show a running indicator in the panel while a shell command is in progress. */
  startSubprocess: (command: string) => void;
  /** Append a log line to the running subprocess indicator. */
  logSubprocess: (line: string) => void;
  /** Clear the subprocess indicator when the command finishes. */
  endSubprocess: () => void;
  /** Refresh local/cloud commit metadata used by the status bar reimport hint. */
  refreshWorkspaceCommits?: () => Promise<void>;
}

export interface Command {
  name: string;
  description: string;
  execute: (args: string, ctx: CommandContext) => void | Promise<void>;
}
