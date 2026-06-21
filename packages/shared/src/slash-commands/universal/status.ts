import type { UniversalCommand, UniversalCommandContext } from "../types/index.js";
import * as helpers from "../helpers.js";

export const statusCommand: UniversalCommand = {
  name: "status",
  description: "Show connection status",
  execute: async (_args: string, ctx: UniversalCommandContext): Promise<string> => {
    const { isConnected, currentModel, availableModels, workspacePath, toolClient } = ctx;
    
    const servers = toolClient.getServerStatuses();
    const connectedServers = servers.filter((s) => s.connected).length;
    const totalTools = servers.reduce((sum: number, s: { toolCount: number }) => sum + s.toolCount, 0);
    
    let output = "# Connection Status\n\n";
    output += `- **Connected**: ${isConnected ? "✅" : "❌"}\n`;
    output += `- **Model**: \`${currentModel}\`\n`;
    output += `- **Available Models**: ${availableModels?.length || 0}\n`;
    output += `- **MCP Servers**: ${connectedServers}/${servers.length} (${totalTools} tools)\n`;
    output += `- **Workspace**: \`${workspacePath}\`\n`;
    
    return output.trim() + "\n";
  },
};
