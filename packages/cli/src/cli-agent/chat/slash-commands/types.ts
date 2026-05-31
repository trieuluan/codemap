import type { ChatEntry } from "../ui/chat-terminal.js";
import type { CodeMapMcpToolClient } from "../mcp-tools/mcp-tool-client.js";
import type { NineRouterProvider } from "../../core/provider.js";

export interface CommandContext {
  currentModel: string;
  provider: NineRouterProvider;
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
  switchMastraThread?: (threadId: string) => Promise<boolean>;
  loadMastraThreadMessages?: (threadId: string) => Promise<void>;
  /** Show a running indicator in the panel while a shell command is in progress. */
  startSubprocess: (command: string) => void;
  /** Append a log line to the running subprocess indicator. */
  logSubprocess: (line: string) => void;
  /** Clear the subprocess indicator when the command finishes. */
  endSubprocess: () => void;
  /** Refresh local/cloud commit metadata used by the status bar reimport hint. */
  refreshWorkspaceCommits?: () => Promise<void>;
  /** Reset and reinitialize the Mastra harness with the current toolClient config. */
  reinitHarness?: () => Promise<void>;
  /** Get the list of available commands (injected to break circular deps with index.ts). */
  getCommandList?: () => Command[];
}

export interface Command {
  name: string;
  description: string;
  execute: (args: string, ctx: CommandContext) => void | Promise<void>;
  /** When true, pi-tui-app should intercept Enter on this command and open an inline picker instead. */
  triggerSessionPicker?: boolean;
}
