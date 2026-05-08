import { confirm } from "@clack/prompts";

import { NineRouterProvider } from "../provider.js";
import type {
  ChatMessage,
  ChatToolCall,
  CompletionResponse,
} from "../types.js";
import {
  AUTO_TOOL_NAMES,
  CodeMapMcpToolClient,
  CONFIRM_TOOL_NAMES,
} from "./mcp-tool-client.js";

const MAX_AGENT_TOOL_ITERATIONS = 8;

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
}): Promise<AgentLoopResult> {
  const tools = await input.toolClient.listChatTools();
  const messages: ChatMessage[] = [...input.history, input.userMessage];
  let usedTools = false;

  for (let i = 0; i < MAX_AGENT_TOOL_ITERATIONS; i++) {
    const response = await input.provider.complete({
      model: input.model,
      system: AGENT_SYSTEM_PROMPT,
      messages,
      tools,
      toolChoice: "auto",
    });

    if (!response.toolCalls || response.toolCalls.length === 0) {
      return {
        text: response.text,
        messages: [
          input.userMessage,
          { role: "assistant", content: response.text },
        ],
        usedTools,
        unsupportedToolCalling: !usedTools && looksLikeNoToolSupport(response),
      };
    }

    usedTools = true;
    messages.push({
      role: "assistant",
      content: response.text,
      toolCalls: response.toolCalls,
    });

    for (const toolCall of response.toolCalls) {
      const result = await executeToolCall(input.toolClient, toolCall);
      messages.push({
        role: "tool",
        name: toolCall.function.name,
        toolCallId: toolCall.id,
        content: result,
      });
    }
  }

  return {
    text: `Stopped after ${MAX_AGENT_TOOL_ITERATIONS} tool iterations. Ask me to continue with a narrower task if needed.`,
    messages: [
      input.userMessage,
      {
        role: "assistant",
        content: `Stopped after ${MAX_AGENT_TOOL_ITERATIONS} tool iterations.`,
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

  if (AUTO_TOOL_NAMES.has(name)) {
    console.log(`→ ${name}`);
    const result = await toolClient.callTool(name, args);
    return formatToolResult(result);
  }

  if (CONFIRM_TOOL_NAMES.has(name)) {
    return runConfirmedPatchTool(toolClient, args);
  }

  return `Tool "${name}" is not allowed.`;
}

async function runConfirmedPatchTool(
  toolClient: CodeMapMcpToolClient,
  args: Record<string, unknown>,
): Promise<string> {
  console.log("→ apply_patch --dry-run");
  const dryRunArgs = { ...args, dry_run: true };
  const dryRun = await toolClient.callTool("apply_patch", dryRunArgs);
  const dryRunText = formatToolResult(dryRun);
  console.log(dryRunText);

  if (dryRun.isError) return dryRunText;

  const approved = await confirm({
    message: "Apply this patch to the workspace?",
    initialValue: false,
  });
  if (approved !== true) {
    return `${dryRunText}\n\nUser declined to apply the patch. No files were changed.`;
  }

  console.log("→ apply_patch");
  const applied = await toolClient.callTool("apply_patch", {
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

function looksLikeNoToolSupport(response: CompletionResponse) {
  const text = response.text.toLowerCase();
  return (
    text.includes("tool") &&
    (text.includes("not support") ||
      text.includes("unsupported") ||
      text.includes("cannot call"))
  );
}
