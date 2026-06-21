import type { UniversalCommand, UniversalCommandContext } from "../types/index.js";
import * as helpers from "../helpers.js";

export const mcpCommand: UniversalCommand = {
  name: "mcp",
  description: "Show MCP servers",
  execute: async (_args: string, ctx: UniversalCommandContext): Promise<string> => {
    const { toolClient } = ctx;
    
    try {
      const servers = toolClient.getServerStatuses();
      
      if (servers.length === 0) {
        return "# MCP Servers\n\nNo MCP servers configured.";
      }
      
      return helpers.formatMcpServers(servers);
    } catch (error) {
      return `# MCP Servers\n\nError loading MCP servers: ${(error as Error).message}`;
    }
  },
};
