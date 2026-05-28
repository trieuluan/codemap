import type { Command } from "./types.js";

export const modelCommand: Command = {
  name: "model",
  description: "Switch model",
  execute: (args, ctx) => {
    const newName = args.trim();
    if (!newName) {
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Current model: ${ctx.currentModel}\nUsage: /model <name>\nUse /models to see available models.`,
        },
      ]);
      return;
    }
    if (
      ctx.availableModels &&
      ctx.availableModels.length > 0 &&
      !ctx.availableModels.includes(newName)
    ) {
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Model "${newName}" not found in gateway. Use /models to see available models.`,
        },
      ]);
      return;
    }
    const oldModel = ctx.currentModel;
    ctx.setCurrentModel(newName);
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: `Switched model: ${oldModel} → ${newName}`,
      },
    ]);
  },
};
