import type { UniversalCommand } from "../types/index.js";

export const helpCommand: UniversalCommand = {
  name: "help",
  description: "Show this help",
  execute: async (_args: string): Promise<string> => {
    const commands = [
      { name: "help", description: "Show this help" },
      { name: "status", description: "Show connection status" },
      { name: "mcp", description: "Show MCP servers" },
      { name: "login", description: "Log in to CodeMap" },
      { name: "logout", description: "Log out" },
      { name: "tools", description: "List available tools" },
      { name: "models", description: "List available models" },
      { name: "projects", description: "List cloud projects" },
      { name: "link", description: "Link a project" },
      { name: "clear", description: "Clear conversation" },
    ];
    
    let output = "# Available Commands\n\n| Command | Description |\n";
    output += "|---------|-------------|\n";
    
    for (const cmd of commands) {
      output += `| \`${cmd.name}\` | ${cmd.description} |\n`;
    }
    
    output += "\n@mention           Type @ to autocomplete file paths\n";
    
    return output;
  },
};
