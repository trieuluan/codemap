import type { ChatEntry } from "../terminal/chat-terminal.js";
import type { CodeMapMcpToolClient } from "../../agent/tools/mcp/mcp-tool-client.js";
import type { NineRouterProvider } from "../../agent/core/provider.js";

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
  // -- Session Tree operations --
  /** Branch active conversation to a different entry. Next message goes there. */
  branchMastraThread?: (entryId: string) => Promise<void>;
  /** Fork current thread from a branch point. Returns new thread ID and switches to it. */
  forkMastraThread?: (fromEntryId?: string, title?: string) => Promise<string>;
  /** Get the session tree (nested) for UI rendering. */
  getMastraThreadTree?: (threadId?: string) => Promise<import("../session-tree.js").TreeNode[] | null>;
  /** Get the current active leaf entry ID. */
  getMastraActiveLeafId?: (threadId?: string) => Promise<string | null>;
}

export interface Command {
  name: string;
  description: string;
  execute: (args: string, ctx: CommandContext) => void | Promise<void>;
  /** When true, pi-tui-app should intercept Enter on this command and open an inline picker instead. */
  triggerSessionPicker?: boolean;
  /** When true, pi-tui-app should intercept Enter on this command and open fullscreen tree picker. */
  triggerTreePicker?: boolean;
  /** When true, pi-tui-app should intercept Enter on this command and open fullscreen fork picker. */
  triggerForkPicker?: boolean;
}
