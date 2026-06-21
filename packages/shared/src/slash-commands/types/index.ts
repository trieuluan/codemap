/** Interface for message append operations - used by slash commands */
export interface Appender {
  /** Append a system or user message with markdown content */
  appendMessage: (msg: { role: "system" | "user"; content: string }) => void;
  
  /** Get current messages history */
  getMessages: () => { role: string; content: string; timestamp?: number }[];
  
  /** Set/replace all messages */
  setMessages: (messages: Array<{ role: string; content: string; timestamp?: number }>) => void;
}

/** Shared context available to universal slash commands */
export interface UniversalCommandContext extends Appender {
  /** Current active model name */
  currentModel: string;
  
  /** Available models list */
  availableModels?: string[];
  
  /** MCP tool client for executing tools */
  toolClient: {
    callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    listAllowedTools: () => Promise<Array<{ name: string }>>;
    getServerStatuses: () => Array<{ 
      name: string; 
      connected: boolean; 
      toolCount: number;
      transport: string;
    }>;
  };
  
  /** Get workspace path */
  workspacePath: string;
  
  /** Get/set connection status */
  isConnected: boolean;
  setIsConnected: (connected: boolean) => void;
}

/** Universal slash command definition */
export interface UniversalCommand {
  /** Command name without / prefix (e.g., "help", "status") */
  name: string;
  
  /** User-facing description */
  description: string;
  
  /** Execute command - returns markdown output */
  execute: (args: string, ctx: UniversalCommandContext) => Promise<string>;
}
