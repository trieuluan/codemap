import type { UniversalCommand, UniversalCommandContext } from "../types/index.js";

export const modelsCommand: UniversalCommand = {
  name: "models",
  description: "List available models",
  execute: async (_args: string, ctx: UniversalCommandContext): Promise<string> => {
    const { currentModel, availableModels } = ctx;
    
    if (!availableModels || availableModels.length === 0) {
      return `# Available Models\n\nNo models available.\n\nCurrently selected: \`${currentModel}\``;
    }
    
    let output = "# Available Models\n\n";
    output += `**Currently Selected**: \`${currentModel}\`\n\n`;
    output += "**Other Available**:\n\n";
    
    for (const id of availableModels.sort()) {
      const isCurrent = id === currentModel;
      const marker = isCurrent ? "✅ " : "";
      output += `- ${marker}\`${id}\`\n`;
    }
    
    return output.trim() + "\n";
  },
};
