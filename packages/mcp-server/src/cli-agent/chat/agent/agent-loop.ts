import type { ChatMessage, TokenUsage } from "../../types.js";

export interface AgentLoopResult {
  text: string;
  messages: ChatMessage[];
  usedTools: boolean;
  unsupportedToolCalling: boolean;
  usage?: TokenUsage;
}

export type ConfirmEditFn = (
  name: string,
  args: Record<string, unknown>,
  preview: string | null,
) => Promise<boolean>;

export type CancelTaskStreamFn = (reason?: string) => void;

export function createUserRejectedError(toolName: string): Error {
  return Object.assign(
    new Error(`User rejected ${toolName}. Stream stopped.`),
    { name: "UserRejectedError", code: "USER_REJECTED" },
  );
}

export function isUserRejectedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "UserRejectedError" ||
    (err as { code?: string }).code === "USER_REJECTED"
  );
}

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
  if (result.includes("After apply: get_working_diff")) followUps.push("- Working diff checked");
  if (result.includes("After apply: refresh_local_index")) followUps.push("- Index refreshed");

  return [...visibleAppliedLines, "", ...followUps].filter(Boolean).join("\n");
}

function isFileWriteTool(name: string): boolean {
  return name === "edit_file" || name === "write_file";
}
