import type { ChatMessage, TokenUsage } from "../types.js";

export interface AgentLoopResult {
  text: string;
  messages: ChatMessage[];
  usedTools: boolean;
  unsupportedToolCalling: boolean;
  usage?: TokenUsage;
}

export type CancelTaskStreamFn = (reason?: string) => void;

export function formatToolUiResult(name: string, result: string): string {
  if (!isFileWriteTool(name)) return result;
  if (!result.includes("After apply:")) return result;

  const appliedBlock = result.split(/\nAfter apply:/)[0]?.trimEnd() ?? result;
  const visibleAppliedLines: string[] = [];
  for (const line of appliedBlock.split("\n")) {
    if (line.trimStart().startsWith("{")) break;
    visibleAppliedLines.push(line);
  }

  const followUps: string[] = [];
  if (result.includes("After apply: diff")) followUps.push("- Working diff checked");
  if (result.includes("After apply: refresh_local_index")) followUps.push("- Index refreshed");

  return [...visibleAppliedLines, "", ...followUps].filter(Boolean).join("\n");
}

function isFileWriteTool(name: string): boolean {
  return name === "edit_file" || name === "write_file";
}
