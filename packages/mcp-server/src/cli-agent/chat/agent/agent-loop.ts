import { NineRouterProvider } from "../../provider.js";
import type { ChatMessage, ChatToolCall, TokenUsage } from "../../types.js";
import { CodeMapMcpToolClient, fetchResourceContext, isConfirmTool } from "../mcp/mcp-tool-client.js";
import { getCachedContext } from "../../convention-synthesizer.js";
import type { ContextCompactor } from "./context-compactor.js";

const MAX_AGENT_TOOL_ITERATIONS = 50;

function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
}

// Minimal system prompt — intentionally brief.
// Detailed tool routing, workflow gates, and project state are in the MCP
// resource context (codemap://project/context + codemap://rules/agent-workflow)
// which is appended below. This prompt only covers things not in the resource:
// identity, non-CodeMap tools, and hard safety rules.
const AGENT_SYSTEM_PROMPT = `You are CodeMap Chat Agent, a local coding assistant that implements tasks using tools.

## Tool priority for file operations
1. edit_file — ALWAYS use for modifying existing files. Provide enough surrounding context in old_string to make it unique.
2. write_file — ONLY for creating new files or complete rewrites when edit_file cannot apply a diff cleanly.
3. bash — ONLY for running commands (build, test, grep, find). NEVER use bash/sed/python to modify file content when edit_file is available.

Never claim a file changed until the tool confirms it was applied.

## When given an approved plan
Execute it directly using tools. Do NOT restate the plan, explain steps, or ask for confirmation — just implement.

Keep responses concise. State what changed and any remaining risk.`;

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

function addUsage(total: TokenUsage | undefined, next: TokenUsage): TokenUsage {
  return {
    promptTokens: (total?.promptTokens ?? 0) + next.promptTokens,
    completionTokens: (total?.completionTokens ?? 0) + next.completionTokens,
    totalTokens: (total?.totalTokens ?? 0) + next.totalTokens,
  };
}

// Tools that cause the coder to re-plan instead of implement.
export const WORKFLOW_TOOLS = new Set([
  "get_agent_workflow",
  "recommend_agent_workflow",
  "explore_task",
  "suggest_edit_locations",
]);

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
  signal?: AbortSignal;
  compactor?: ContextCompactor;
  confirmEdit?: ConfirmEditFn;
  /** Tool names to exclude — used in execute phase to block re-planning. */
  excludeTools?: Set<string>;
  /** Extra instructions appended to system prompt — used by planner/reviewer phases. */
  systemContext?: string;
}): Promise<AgentLoopResult> {
  throwIfAborted(input.signal);
  let tools = (await input.toolClient.listChatTools()).filter(
    (t) => !input.excludeTools?.has(t.function.name),
  );
  throwIfAborted(input.signal);

  // Fetch MCP resources once and prepend to system prompt
  let resourceContext: string | null = null;
  try {
    resourceContext = await abortable(fetchResourceContext(input.toolClient), input.signal);
  } catch {
    /* non-blocking — agent runs fine without resource context */
  }
  throwIfAborted(input.signal);

  // Inject synthesized project context (read from cache — synthesis happens at startup)
  let cachedCtx: { conventions: string | null; rules: string | null; skills: string | null } =
    { conventions: null, rules: null, skills: null };
  try { cachedCtx = await getCachedContext(); } catch { /* non-blocking */ }

  const systemPrompt = [
    AGENT_SYSTEM_PROMPT,
    input.systemContext,
    resourceContext,
    cachedCtx.conventions ? `## Project Conventions\n\n${cachedCtx.conventions}` : null,
    cachedCtx.rules       ? `## Project Rules\n\n${cachedCtx.rules}`             : null,
    cachedCtx.skills      ? `## Project Skills & Workflows\n\n${cachedCtx.skills}` : null,
  ].filter(Boolean).join("\n\n");

  // Strip orphaned tool messages and tool-call metadata from history.
  // Both sides of the pair must be present or absent — mixing causes provider errors:
  //   "orphaned tool result"  → role=tool with no matching assistant toolCall
  //   "tool call without result" → assistant toolCalls with no matching role=tool
  // Strategy: drop role=tool entirely; strip toolCalls field from assistant messages.
  const cleanHistory = input.history
    .filter((msg) => msg.role !== "tool")
    .flatMap((msg) => {
      if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
        const { toolCalls: _dropped, ...rest } = msg;
        // Drop assistant messages that become empty after toolCalls removed —
        // providers reject empty content and such messages add no context.
        if (!rest.content?.trim()) return [];
        return [rest];
      }
      return [msg];
    });
  let allMessages: ChatMessage[] = [...cleanHistory, input.userMessage].map((msg) =>
    msg.role === "tool" ? { ...msg, content: stripAnsi(msg.content) } : msg,
  );
  const resultMessages: ChatMessage[] = [input.userMessage];
  let usedTools = false;
  let finalText = "";
  let toolSupportFailed = false;
  let accumulatedUsage: TokenUsage | undefined;
  let lastFailedTool: { name: string; args: string } | null = null;
  let consecutiveFailures = 0;

  // Truncate large tool results and auto-compact history before first API call.
  if (input.compactor) {
    allMessages = input.compactor.truncateToolResults(allMessages);
    const compacted = await abortable(
      input.compactor.maybeCompact(allMessages, input.model, { reason: "auto_threshold" }),
      input.signal,
    );
    if (compacted.compacted) allMessages = compacted.messages;
  }

  let shouldBreak = false;
  for (let i = 0; i < MAX_AGENT_TOOL_ITERATIONS; i++) {
    throwIfAborted(input.signal);
    // Compact history if it is still growing too large during tool iterations.
    if (input.compactor && i > 0) {
      const compacted = await abortable(
        input.compactor.maybeCompact(allMessages, input.model, { reason: "auto_threshold" }),
        input.signal,
      );
      if (compacted.compacted) allMessages = compacted.messages;
    }
    throwIfAborted(input.signal);

    const cleanedMessages = dropOrphanedToolMessages(allMessages);
    const droppedCount = allMessages.length - cleanedMessages.length;
    if (droppedCount > 0) {
      console.warn("[agent-loop] dropped orphaned tool messages", { droppedCount, iteration: i });
    }
    const streamRequest = {
      model: input.model,
      system: systemPrompt,
      messages: cleanedMessages,
      signal: input.signal,
      ...(tools.length > 0 && !toolSupportFailed ? { tools } : {}),
    };

    let accumulated = "";
    let accumulatedReasoning = "";
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
        throwIfAborted(input.signal);
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
        if (chunk.reasoning) {
          accumulatedReasoning += chunk.reasoning;
        }
        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          streamToolCalls = chunk.toolCalls;
        }
        if (chunk.usage) {
          accumulatedUsage = addUsage(accumulatedUsage, chunk.usage);
          input.onUsage?.(accumulatedUsage);
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
    throwIfAborted(input.signal);

    const reasoningField = accumulatedReasoning
      ? { reasoning_content: accumulatedReasoning }
      : {};

    if (!streamToolCalls || streamToolCalls.length === 0) {
      // No tool calls — final text response, done streaming
      resultMessages.push({ role: "assistant", content: finalText, ...reasoningField });
      return {
        text: finalText,
        messages: resultMessages,
        usedTools,
        unsupportedToolCalling: toolSupportFailed,
        usage: accumulatedUsage,
      };
    }

    // Model wants to call tools.
    // allMessages gets full data for current turn context.
    // resultMessages gets a single compact assistant message per iteration — no tool role messages,
    // which avoids tool_use_id / tool_result pairing issues across providers.
    usedTools = true;
    allMessages.push({
      role: "assistant",
      content: accumulated,
      ...reasoningField,
      toolCalls: streamToolCalls,
    });

    const iterationSummaryParts: string[] = [];
    if (accumulated.trim()) iterationSummaryParts.push(accumulated.trim());

    for (const toolCall of streamToolCalls) {
      throwIfAborted(input.signal);
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

      input.onToolStart?.(toolCall.function.name, toolCall.function.arguments, toolCall.id);
      const rawResult = await executeToolCall(input.toolClient, toolCall, input.confirmEdit, input.signal);
      throwIfAborted(input.signal);
      const result = stripAnsi(rawResult);
      const uiResult = formatToolUiResult(toolCall.function.name, result);
      const uiLimit = isFileWriteTool(toolCall.function.name) ? 1_200 : 500;
      const truncatedResult = uiResult.length > uiLimit ? uiResult.slice(0, uiLimit) + "\n..." : uiResult;
      input.onToolResult?.(toolCall.function.name, truncatedResult);

      // Track consecutive tool failures — including blocked bash writes so the model doesn't retry loops.
      const isConflict = result.includes("conflict") || result.includes("FAILED") || result.includes("not_found") || result.includes("[BASH_WRITE_BLOCKED]");
      if (isConflict) {
        lastFailedTool = { name: toolCall.function.name, args: toolCall.function.arguments };
      } else {
        lastFailedTool = null;
        consecutiveFailures = 0;
      }

      // allMessages: full result for current turn.
      allMessages.push({ role: "tool", name: toolCall.function.name, toolCallId: toolCall.id, content: result });

      // Accumulate compact summary for resultMessages (no tool role — avoids provider pairing issues).
      const snippet = result.length > 120 ? result.slice(0, 120) + "…" : result;
      iterationSummaryParts.push(`[${toolCall.function.name} → ${snippet}]`);
    }

    if (!shouldBreak && iterationSummaryParts.length > 0) {
      resultMessages.push({ role: "assistant", content: iterationSummaryParts.join("\n") });
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
  signal?: AbortSignal,
): Promise<string> {
  throwIfAborted(signal);
  const name = toolCall.function.name;
  const args = parseToolArguments(toolCall.function.arguments);

  if (isConfirmTool(name)) {
    return runConfirmedEditTool(toolClient, name, args, confirmEdit, signal);
  }

  const result = await abortable(toolClient.callTool(name, args), signal);
  return formatToolResult(result);
}

async function runConfirmedEditTool(
  toolClient: CodeMapMcpToolClient,
  name: string,
  args: Record<string, unknown>,
  confirmEdit?: ConfirmEditFn,
  signal?: AbortSignal,
): Promise<string> {
  throwIfAborted(signal);
  const dryRunArgs = { ...args, dry_run: true };
  const dryRun = await abortable(toolClient.callTool(name, dryRunArgs), signal);
  throwIfAborted(signal);
  const dryRunText = formatToolResult(dryRun);
  const dryRunPreview = dryRun.content || dryRunText;

  if (dryRun.isError) return dryRunText;

  const preview = dryRunPreview || renderEditDiffPreview(name, args);

  // Use Ink-native confirm callback, or auto-approve if no callback (non-TUI mode)
  const approved = confirmEdit
    ? await confirmEdit(name, args, preview)
    : true;
  throwIfAborted(signal);

  if (!approved) {
    throw createUserRejectedError(name);
  }

  const applied = await abortable(
    toolClient.callTool(name, {
      ...args,
      dry_run: false,
    }),
    signal,
  );
  throwIfAborted(signal);
  const diff = await abortable(
    toolClient.callTool("get_working_diff", {
      include_patch: false,
      include_untracked: true,
    }),
    signal,
  );
  throwIfAborted(signal);
  const refreshed = await abortable(
    toolClient.callTool("refresh_local_index", {
      force: true,
    }),
    signal,
  );

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

function dropOrphanedToolMessages(messages: ChatMessage[]): ChatMessage[] {
  const pairedIds = new Set<string>();
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.toolCalls) {
      for (const tc of msg.toolCalls) pairedIds.add(tc.id);
    }
  }
  return messages.filter(
    (msg) => msg.role !== "tool" || (!!msg.toolCallId && pairedIds.has(msg.toolCallId)),
  );
}

function createAbortError(): Error {
  const err = new Error("Task canceled.");
  err.name = "AbortError";
  return err;
}

export function createUserRejectedError(toolName: string): Error {
  const err = Object.assign(new Error(`User rejected ${toolName}. Stream stopped.`), {
    name: "UserRejectedError",
    code: "USER_REJECTED",
  });
  return err;
}

export function isUserRejectedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "UserRejectedError" || (err as { code?: string }).code === "USER_REJECTED";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError();
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  throwIfAborted(signal);
  if (!signal) return promise;
  let cleanup: (() => void) | undefined;
  const abortPromise = new Promise<T>((_, reject) => {
    const onAbort = () => reject(createAbortError());
    cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([
    promise.then(
      (value) => {
        cleanup?.();
        return value;
      },
      (err) => {
        cleanup?.();
        throw err;
      },
    ),
    abortPromise,
  ]);
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

function isFileWriteTool(name: string): boolean {
  return name === "edit_file" || name === "write_file";
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
  if (result.includes("After apply: get_working_diff")) {
    followUps.push("- Working diff checked");
  }
  if (result.includes("After apply: refresh_local_index")) {
    followUps.push("- Index refreshed");
  }

  return [...visibleAppliedLines, "", ...followUps].filter(Boolean).join("\n");
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
