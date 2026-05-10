import { confirm } from "@clack/prompts";

import { NineRouterProvider } from "../provider.js";
import type {
  ChatMessage,
  ChatToolCall,
} from "../types.js";
import {
  CodeMapMcpToolClient,
  isConfirmTool,
} from "./mcp-tool-client.js";

const MAX_AGENT_TOOL_ITERATIONS = 50;

const AGENT_SYSTEM_PROMPT = `You are CodeMap Chat Agent, a local coding assistant.

Use MCP tools for codebase work. Start broad implementation/debug/refactor tasks with get_agent_workflow and recommend_agent_workflow. Use search_codebase, get_file, get_files, find_related_files, find_usages, and find_callers before proposing edits.

For edits, create unified diffs and call apply_patch. The CLI will force dry_run first and ask the user before applying real file changes. Never claim a file was changed until apply_patch reports it was applied. After edits, inspect get_working_diff and refresh_local_index.

Keep final answers concise and include verification or remaining risk.`;

export interface AgentLoopResult {
  text: string;
  messages: ChatMessage[];
  usedTools: boolean;
  unsupportedToolCalling: boolean;
}

export async function runAgentLoop(input: {
  provider: NineRouterProvider;
  model: string;
  history: ChatMessage[];
  userMessage: ChatMessage;
  toolClient: CodeMapMcpToolClient;
  onToken?: (text: string) => void;
}): Promise<AgentLoopResult> {
  let tools = await input.toolClient.listChatTools();
  const allMessages: ChatMessage[] = [...input.history, input.userMessage];
  const resultMessages: ChatMessage[] = [input.userMessage];
  let usedTools = false;
  let finalText = "";
  let toolSupportFailed = false;

  for (let i = 0; i < MAX_AGENT_TOOL_ITERATIONS; i++) {
    const streamRequest = {
      model: input.model,
      system: AGENT_SYSTEM_PROMPT,
      messages: allMessages,
      ...(tools.length > 0 && !toolSupportFailed ? { tools } : {}),
    };

    let accumulated = "";
    let streamToolCalls: ChatToolCall[] | undefined;

    try {
      for await (const chunk of input.provider.stream(streamRequest)) {
        if (chunk.text) {
          accumulated += chunk.text;
          input.onToken?.(chunk.text);
        }
        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          streamToolCalls = chunk.toolCalls;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (tools.length > 0 && !toolSupportFailed && isToolSupportError(msg)) {
        console.warn("Model does not support tool calling — falling back to text-only mode.");
        tools = [];
        toolSupportFailed = true;
        continue; // retry loop without tools
      }
      throw err;
    }

    finalText = accumulated;

    if (!streamToolCalls || streamToolCalls.length === 0) {
      // No tool calls — final text response, done streaming
      resultMessages.push({ role: "assistant", content: finalText });
      return {
        text: finalText,
        messages: resultMessages,
        usedTools,
        unsupportedToolCalling: !usedTools && looksLikeNoToolSupportText(finalText),
      };
    }

    // Model wants to call tools
    usedTools = true;
    allMessages.push({
      role: "assistant",
      content: accumulated,
      toolCalls: streamToolCalls,
    });
    resultMessages.push({
      role: "assistant",
      content: accumulated,
      toolCalls: streamToolCalls,
    });

    for (const toolCall of streamToolCalls) {
      const result = await executeToolCall(input.toolClient, toolCall);
      allMessages.push({
        role: "tool",
        name: toolCall.function.name,
        toolCallId: toolCall.id,
        content: result,
      });
      resultMessages.push({
        role: "tool",
        name: toolCall.function.name,
        toolCallId: toolCall.id,
        content: result,
      });
    }

    // Reset streaming text for next iteration
    if (input.onToken) input.onToken("\n");
  }

  return {
    text: `Hit safety limit (${MAX_AGENT_TOOL_ITERATIONS} iterations). This likely indicates a runaway loop — try a narrower task.`,
    messages: [
      ...resultMessages,
      {
        role: "assistant",
        content: `Hit safety limit (${MAX_AGENT_TOOL_ITERATIONS} iterations). This likely indicates a runaway loop — try a narrower task.`,
      },
    ],
    usedTools,
    unsupportedToolCalling: false,
  };
}

async function executeToolCall(
  toolClient: CodeMapMcpToolClient,
  toolCall: ChatToolCall,
): Promise<string> {
  const name = toolCall.function.name;
  const args = parseToolArguments(toolCall.function.arguments);

  if (isConfirmTool(name)) {
    return runConfirmedPatchTool(toolClient, name, args);
  }

  console.log(`→ ${name}`);
  const result = await toolClient.callTool(name, args);
  return formatToolResult(result);
}

async function runConfirmedPatchTool(
  toolClient: CodeMapMcpToolClient,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  console.log(`→ ${name} (dry-run)`);
  const dryRunArgs = { ...args, dry_run: true };
  const dryRun = await toolClient.callTool(name, dryRunArgs);
  const dryRunText = formatToolResult(dryRun);
  console.log(dryRunText);

  if (dryRun.isError) return dryRunText;

  const approved = await confirm({
    message: `Apply ${name} to the workspace?`,
    initialValue: false,
  });
  if (approved !== true) {
    return `${dryRunText}\n\nUser declined. No files were changed.`;
  }

  console.log(`→ ${name}`);
  const applied = await toolClient.callTool(name, {
    ...args,
    dry_run: false,
  });
  const diff = await toolClient.callTool("get_working_diff", {
    include_patch: false,
    include_untracked: true,
  });
  const refreshed = await toolClient.callTool("refresh_local_index", {
    force: true,
  });

  return [
    formatToolResult(applied),
    "\nAfter apply: get_working_diff",
    formatToolResult(diff),
    "\nAfter apply: refresh_local_index",
    formatToolResult(refreshed),
  ].join("\n");
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to a helpful error payload.
  }
  return { __invalidArguments: raw };
}

function formatToolResult(result: {
  content: string;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}) {
  const parts = [result.content];
  if (result.structuredContent) {
    parts.push(JSON.stringify(result.structuredContent, null, 2));
  }
  if (result.isError) parts.push("[tool returned error]");
  return parts.filter(Boolean).join("\n");
}

function looksLikeNoToolSupportText(text: string) {
  const lower = text.toLowerCase();
  return (
    lower.includes("tool") &&
    (lower.includes("not support") ||
      lower.includes("unsupported") ||
      lower.includes("cannot call"))
  );
}

function isToolSupportError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("zero-length") ||
    lower.includes("empty document") ||
    (lower.includes("tool") && (lower.includes("not support") || lower.includes("unsupported"))) ||
    (lower.includes("invalid_request") && lower.includes("tool"))
  );
}
