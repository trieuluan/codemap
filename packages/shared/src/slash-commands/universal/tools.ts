import type { UniversalCommand, UniversalCommandContext } from "../types/index.js";
import * as helpers from "../helpers.js";

export const toolsCommand: UniversalCommand = {
  name: "tools",
  description: "List available tools",
  execute: async (_args: string, ctx: UniversalCommandContext): Promise<string> => {
    const { toolClient } = ctx;
    
    try {
      const tools = await toolClient.listAllowedTools();
      
      if (tools.length === 0) {
        return "# Available Tools\n\nNo tools available.";
      }
      
      tools.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
      
      return helpers.formatToolsByServer(tools);
    } catch (error) {
      return `# Available Tools\n\nError loading tools: ${(error as Error).message}`;
    }
  },
};
