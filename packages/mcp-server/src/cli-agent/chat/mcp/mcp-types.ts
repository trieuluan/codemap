// Shared types for MCP tool client and server connection.
// Extracted here to break the circular dependency between
// mcp-tool-client.ts and mcp-server-connection.ts.

export interface AgentTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentToolCallResult {
  content: string;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface McpServerStatus {
  name: string;
  connected: boolean;
  tools: number;
  error?: string;
}
