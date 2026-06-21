/**
 * Shared utility functions for slash command outputs
 */

/** Format tools as markdown table with descriptions */
export function formatToolsTable(tools: Array<{ name: string; description?: string }>): string {
  const lines = ["| Command | Description |", "|---------|-------------|"];
  
  for (const tool of tools) {
    const desc = tool.description || "No description available";
    lines.push(`| \`/${tool.name}\` | ${desc} |`);
  }
  
  return lines.join("\n");
}

/** Format tools grouped by server prefix as markdown lists */
export function formatToolsByServer(tools: Array<{ name: string }>): string {
  // Group by server prefix (first part before _)
  const grouped = new Map<string, string[]>();
  
  for (const tool of tools) {
    const parts = tool.name.split("_");
    const serverPrefix = parts[0] || "unknown";
    
    if (!grouped.has(serverPrefix)) {
      grouped.set(serverPrefix, []);
    }
    grouped.get(serverPrefix)!.push(tool.name);
  }
  
  let output = "# Available Tools\n\n";
  
  for (const [server, toolNames] of grouped.entries()) {
    output += `### \`${server}\`\n\n`;
    for (const name of toolNames.sort()) {
      output += `- \`${name}\`\n`;
    }
    output += "\n";
  }
  
  return output.trim() + "\n";
}

/** Format MCP server statuses */
export function formatMcpServers(
  servers: Array<{ 
    name: string; 
    connected: boolean; 
    connecting?: boolean;
    toolCount: number;
    transport: string;
    error?: string;
  }>
): string {
  if (servers.length === 0) {
    return "# MCP Servers\n\nNo MCP servers configured.";
  }
  
  let output = "# MCP Servers\n\n";
  
  for (const s of servers) {
    const status = s.connected ? "connected" : s.connecting ? "connecting" : "disconnected";
    const icon = s.connected ? "✅" : s.connecting ? "⏳" : "❌";
    
    output += `#### ${icon} ${s.name} (${s.toolCount} tools)\n\n`;
    output += `- **Status**: ${status}\n`;
    output += `- **Transport**: ${s.transport}\n`;
    
    if (s.error) {
      output += `- **Error**: ${s.error}\n`;
    }
    
    output += "\n";
  }
  
  return output.trim();
}

/** Format model list as markdown bullet list */
export function formatModelList(models: Array<{ id: string; name?: string }>): string {
  if (models.length === 0) {
    return "# Available Models\n\nNo models available.";
  }
  
  let output = "# Available Models\n\n";
  
  for (const model of models) {
    const name = model.name || model.id;
    output += `- \`${model.id}\` - ${name}\n`;
  }
  
  return output.trim();
}
