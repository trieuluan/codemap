import { NineRouterProvider } from "../../provider.js";
import type { ChatMessage, ChatToolCall, TokenUsage } from "../../types.js";
import { CodeMapMcpToolClient, fetchResourceContext, isConfirmTool } from "../mcp/mcp-tool-client.js";
import type { ContextCompactor } from "./context-compactor.js";

const MAX_AGENT_TOOL_ITERATIONS = 50;

const AGENT_SYSTEM_PROMPT = `You are CodeMap Chat Agent, a local coding assistant.

Use MCP tools for codebase work. Start broad implementation/debug/refactor tasks with get_agent_workflow and recommend_agent_workflow. Use search_codebase, get_file, get_files, find_related_files, find_usages, and find_callers before proposing edits.

For edits, use edit_file(path, old_string, new_string) for targeted string replacements. Use write_file(path, content) for new files or full rewrites. Include enough surrounding context in old_string to make it unique. The CLI will ask the user before applying real file changes. Never claim a file was changed until the tool reports it was applied. After edits, call get_working_diff and refresh_local_index.

Keep final answers concise and include verification or remaining risk.`;

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

export async function runAgentLoop(input: {
  provider: NineRouterProvider;
  model: string;
  history: ChatMessage[];
  userMessage: ChatMessage;
  toolClient: CodeMapMcpToolClient;
  onToken?: (text: string) => void;
  onModel?: (model: string) => void;
  onToolStart?: (name: string, args: string, id: string) => void;
  onToolResult?: (name: string, result: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  onDebug?: (info: Record<string, unknown>) => void;
  debug?: boolean;
  compactor?: ContextCompactor;
  confirmEdit?: ConfirmEditFn;
}): Promise<AgentLoopResult> {
  let tools = await input.toolClient.listChatTools();

  // Fetch MCP resources once and prepend to system prompt
  let resourceContext: string | null = null;
  try {
    resourceContext = await fetchResourceContext(input.toolClient);
  } catch {
    /* non-blocking — agent runs fine without resource context */
  }

  const systemPrompt = resourceContext
    ? AGENT_SYSTEM_PROMPT + "\n\n" + resourceContext
    : AGENT_SYSTEM_PROMPT;

  let allMessages: ChatMessage[] = [...input.history, input.userMessage];
  const resultMessages: ChatMessage[] = [input.userMessage];
  let usedTools = false;
  let finalText = "";
  let toolSupportFailed = false;
  let accumulatedUsage: TokenUsage | undefined;
  let lastFailedTool: { name: string; args: string } | null = null;
  let consecutiveFailures = 0;

  // Truncate large tool results in history before first API call
  if (input.compactor) {
    allMessages = input.compactor.truncateToolResults(allMessages);
  }

  let shouldBreak = false;
  for (let i = 0; i < MAX_AGENT_TOOL_ITERATIONS; i++) {
    // Compact history if it's growing too large
    if (input.compactor && i > 0) {
      const compacted = await input.compactor.compactIfNeeded(allMessages, input.model);
      if (compacted) allMessages = compacted;
    }

    const streamRequest = {
      model: input.model,
      system: systemPrompt,
      messages: allMessages,
      ...(tools.length > 0 && !toolSupportFailed ? { tools } : {}),
    };

    let accumulated = "";
    let streamToolCalls: ChatToolCall[] | undefined;
    try {
      input.onDebug?.({
        event: "stream_request",
        model: streamRequest.model,
        messageCount: streamRequest.messages.length,
        toolCount: streamRequest.tools?.length ?? 0,
        hasSystem: !!streamRequest.system,
      });
      let chunkIdx = 0;
      for await (const chunk of input.provider.stream(
        streamRequest,
        input.debug,
      )) {
        const debugInfo: Record<string, unknown> = {
          chunk: chunkIdx++,
          text: chunk.text || "",
          model: chunk.model,
          done: chunk.done ?? false,
        };
        if (chunk.toolCalls) {
          debugInfo.toolCalls = chunk.toolCalls.map((tc) => ({
            name: tc.function.name,
            args: tc.function.arguments.slice(0, 200),
          }));
        }
        input.onDebug?.(debugInfo);
        if (chunk.model) {
          input.onModel?.(chunk.model);
        }
        if (chunk.text) {
          accumulated += chunk.text;
          input.onToken?.(chunk.text);
        }
        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          streamToolCalls = chunk.toolCalls;
        }
        if (chunk.usage) {
          accumulatedUsage = chunk.usage;
          input.onUsage?.(chunk.usage);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (tools.length > 0 && !toolSupportFailed && isToolSupportError(msg)) {
        input.onDebug?.({ event: "tool_fallback", reason: msg.slice(0, 200) });
        tools = [];
        toolSupportFailed = true;
        continue; // retry loop without tools
      }
      // Model-level error (broken, rate-limited, empty response) — no retry
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
        unsupportedToolCalling: toolSupportFailed,
        usage: accumulatedUsage,
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
      // Detect consecutive identical failed tool calls
      if (
        lastFailedTool &&
        toolCall.function.name === lastFailedTool.name &&
        toolCall.function.arguments === lastFailedTool.args
      ) {
        consecutiveFailures++;
        if (consecutiveFailures >= 2) {
          const msg = `Tool "${toolCall.function.name}" failed ${consecutiveFailures} times with identical arguments. Stopping — please use a different approach or read the file first.`;
          resultMessages.push({ role: "assistant", content: msg });
          shouldBreak = true;
          break;
        }
      }

      input.onToolStart?.(
        toolCall.function.name,
        toolCall.function.arguments,
        toolCall.id,
      );
      const result = await executeToolCall(input.toolClient, toolCall, input.confirmEdit);
      const truncatedResult =
        result.length > 500 ? result.slice(0, 500) + "\n..." : result;
      input.onToolResult?.(toolCall.function.name, truncatedResult);

      // Track consecutive tool failures
      const isConflict =
        (result.includes("conflict") || result.includes("FAILED") || result.includes("not_found"));
      if (isConflict) {
        lastFailedTool = {
          name: toolCall.function.name,
          args: toolCall.function.arguments,
        };
      } else {
        lastFailedTool = null;
        consecutiveFailures = 0;
      }

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
    if (shouldBreak) break;

    // Reset streaming text for next iteration
    if (input.onToken) input.onToken("\n");
  }

  const limitMsg = shouldBreak
    ? resultMessages[resultMessages.length - 1]?.content ?? "Stopped."
    : `Hit safety limit (${MAX_AGENT_TOOL_ITERATIONS} iterations). This likely indicates a runaway loop — try a narrower task.`;

  return {
    text: limitMsg,
    messages: [
      ...resultMessages,
      ...(!shouldBreak
        ? [{ role: "assistant" as const, content: limitMsg }]
        : []),
    ],
    usedTools,
    unsupportedToolCalling: false,
    usage: accumulatedUsage,
  };
}

async function executeToolCall(
  toolClient: CodeMapMcpToolClient,
  toolCall: ChatToolCall,
  confirmEdit?: ConfirmEditFn,
): Promise<string> {
  const name = toolCall.function.name;
  const args = parseToolArguments(toolCall.function.arguments);

  if (isConfirmTool(name)) {
    return runConfirmedEditTool(toolClient, name, args, confirmEdit);
  }

  const result = await toolClient.callTool(name, args);
  return formatToolResult(result);
}

async function runConfirmedEditTool(
  toolClient: CodeMapMcpToolClient,
  name: string,
  args: Record<string, unknown>,
  confirmEdit?: ConfirmEditFn,
): Promise<string> {
  const dryRunArgs = { ...args, dry_run: true };
  const dryRun = await toolClient.callTool(name, dryRunArgs);
  const dryRunText = formatToolResult(dryRun);

  if (dryRun.isError) return dryRunText;

  const preview = renderEditDiffPreview(name, args);

  // Use Ink-native confirm callback, or auto-approve if no callback (non-TUI mode)
  const approved = confirmEdit
    ? await confirmEdit(name, args, preview)
    : true;

  if (!approved) {
    return `${dryRunText}\n\nUser declined. No files were changed.`;
  }

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

function renderEditDiffPreview(
  toolName: string,
  args: Record<string, unknown>,
): string | null {
  if (toolName === "edit_file") {
    const filePath = (args.file_path as string) ?? "";
    const oldStr = (args.old_string as string) ?? "";
    const newStr = (args.new_string as string) ?? "";
    const lines = [`--- a/${filePath}`, `+++ b/${filePath}`];
    for (const l of oldStr.split("\n")) lines.push(`-${l}`);
    for (const l of newStr.split("\n")) lines.push(`+${l}`);
    return lines.join("\n");
  }

  if (toolName === "write_file") {
    const filePath = (args.file_path as string) ?? "";
    const content = (args.content as string) ?? "";
    const lines = [`--- /dev/null`, `+++ b/${filePath}`];
    for (const l of content.split("\n")) lines.push(`+${l}`);
    return lines.join("\n");
  }

  return null;
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

function isToolSupportError(message: string): boolean {
  const lower = message.toLowerCase();
  // "zero-length" / "empty document" is a model-level issue (broken model, rate limit),
  // NOT a tool-support problem — do NOT fall back to text-only for these.
  return (
    (lower.includes("tool") &&
      (lower.includes("not support") || lower.includes("unsupported"))) ||
    (lower.includes("invalid_request") && lower.includes("tool"))
  );
}
