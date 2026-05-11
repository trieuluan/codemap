import type { GatewayMode } from "../../types.js";
import { getModeDisplay, getModeSwitchWarning } from "./route-policy.js";
import type { Command } from "./index.js";

const VALID_MODES: GatewayMode[] = [
  "local-only",
  "ask-before-cloud",
  "cloud-ok",
  "hybrid",
];

export const modeCommand: Command = {
  name: "mode",
  description: "Switch mode (local-only|ask-before-cloud|cloud-ok|hybrid)",
  execute: (args, ctx) => {
    if (!args) {
      const modeInfo = getModeDisplay(ctx.currentMode);
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: [
            `Current mode: ${ctx.currentMode} [${modeInfo.label}]`,
            modeInfo.description,
            "",
            "Available modes:",
            "  local-only        — Only local models allowed",
            "  ask-before-cloud  — Confirm before using cloud models",
            "  cloud-ok          — All models allowed",
            "  hybrid            — Auto-select local/cloud by task",
          ].join("\n"),
        },
      ]);
      return;
    }
    if (!VALID_MODES.includes(args as GatewayMode)) {
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Invalid mode: "${args}".\nValid: ${VALID_MODES.join(", ")}`,
        },
      ]);
      return;
    }
    const newMode = args as GatewayMode;
    const warning = getModeSwitchWarning(ctx.currentModel, newMode);
    const oldMode = ctx.currentMode;
    ctx.setCurrentMode(newMode);
    const parts = [`Switched mode: ${oldMode} → ${newMode}`];
    if (warning) parts.push(`\n${warning}`);
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: parts.join("") },
    ]);
  },
};
