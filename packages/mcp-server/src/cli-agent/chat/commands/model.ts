import { checkModelPolicy } from "../route-policy.js";
import type { Command } from "./index.js";

export const modelCommand: Command = {
  name: "model",
  description: "Switch model (respects mode policy)",
  execute: (args, ctx) => {
    const confirmed = args.endsWith("--yes");
    const newName = args.replace(/\s*--yes\s*$/, "").trim();
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
    const policy = checkModelPolicy(newName, ctx.currentMode);
    if (!policy.allowed) {
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: `Blocked: ${policy.reason}` },
      ]);
      return;
    }
    if (policy.requireConfirm && !confirmed) {
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `${policy.reason}\nRun /model ${newName} --yes to confirm.`,
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
