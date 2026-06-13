import {
  type AgentSessionController,
  type ApprovalResponse,
  type QuestionResponse,
  type SessionMessage,
  type ThreadSummary,
} from "@codemap-ai/core/agent/contracts";
import {
  createAgentSessionController,
  type AgentSessionDriver,
} from "@codemap-ai/core/agent";
import type { AgentLoopResult } from "@codemap-ai/core/agent";
import type {
  HarnessMessage,
  HarnessThread,
} from "../events.ts";
import type {
  ProviderLike,
  SingleAgentRuntimeInput,
  ToolClientLike,
} from "../runtime-input.ts";
import { runWithMastraHarness, getSingleton } from "../harness/lifecycle.ts";
import {
  deleteMastraThread,
  listMastraThreads,
  listMastraThreadMessages,
  switchMastraThread,
} from "../harness/threads.ts";

interface NodeSessionRuntime {
  run(input: SingleAgentRuntimeInput): Promise<AgentLoopResult>;
  abort(): void;
  listThreads(): Promise<HarnessThread[]>;
  switchThread(threadId: string): Promise<unknown>;
  deleteThread(threadId: string): Promise<unknown>;
  listThreadMessages(threadId: string, limit?: number): Promise<HarnessMessage[]>;
}

export interface CreateNodeAgentSessionOptions {
  provider: ProviderLike;
  providerId?: SingleAgentRuntimeInput["providerId"];
  model: string;
  modeDefaults?: SingleAgentRuntimeInput["modeDefaults"];
  availableModels?: string[];
  availableCombos?: string[];
  toolClient: ToolClientLike;
  agentInstructions?: string;
  toolPreviewBuilder?: (
    name: string,
    args: Record<string, unknown>,
  ) => string | undefined;
  runtime?: NodeSessionRuntime;
}

export function createNodeAgentSession(
  options: CreateNodeAgentSessionOptions,
): AgentSessionController {
  const runtime = options.runtime ?? createDefaultRuntime();
  let activeAbortController: AbortController | null = null;
  const approvalResponders = new Map<
    string,
    (decision: ApprovalResponse["decision"]) => void
  >();
  const questionResponders = new Map<
    string,
    (answer: string | string[]) => void
  >();

  const driver: AgentSessionDriver = {
    async send(input, emit) {
      activeAbortController = new AbortController();
      try {
        await runtime.run({
          provider: options.provider,
          providerId: options.providerId,
          model: input.model ?? options.model,
          modeDefaults: options.modeDefaults,
          availableModels: options.availableModels,
          availableCombos: options.availableCombos,
          agentInstructions: options.agentInstructions,
          userMessage: { role: "user", content: input.content },
          toolClient: options.toolClient,
          signal: activeAbortController.signal,
          effort: input.effort,
          planMode: input.planMode,
          imageFiles: input.images,
          onToken: (text) =>
            emit({ type: "token", requestId: input.requestId, text }),
          onThinking: (text) =>
            emit({ type: "thinking", requestId: input.requestId, text }),
          onModel: (model) =>
            emit({ type: "model", requestId: input.requestId, model }),
          onToolStart: (name, args, toolCallId, preview) =>
            emit({
              type: "tool_start",
              requestId: input.requestId,
              toolCallId,
              name,
              args,
              preview,
            }),
          onToolResult: (_name, result, toolCallId) =>
            emit({
              type: "tool_result",
              requestId: input.requestId,
              toolCallId: toolCallId ?? "",
              result,
              isError: result.startsWith("[ERROR]"),
            }),
          toolPreviewBuilder: options.toolPreviewBuilder,
          onUsage: (usage) =>
            emit({ type: "usage", requestId: input.requestId, usage }),
          onToolApproval: (approval, respond) => {
            approvalResponders.set(approval.toolCallId, respond);
            emit({
              type: "approval",
              requestId: input.requestId,
              approval: {
                approvalId: approval.toolCallId,
                toolCallId: approval.toolCallId,
                toolName: approval.toolName,
                args: (approval.args ?? {}) as Record<string, unknown>,
              },
            });
          },
          onAskQuestion: (
            questionId,
            question,
            questionOptions,
            respond,
            selectionMode,
          ) => {
            questionResponders.set(questionId, respond);
            emit({
              type: "question",
              requestId: input.requestId,
              question: {
                questionId,
                question,
                options: questionOptions?.map((option) => ({
                  label: option.label,
                  description: option.description,
                })),
                selectionMode,
              },
            });
          },
        });
      } finally {
        activeAbortController = null;
      }
    },
    abort() {
      activeAbortController?.abort();
      runtime.abort();
    },
    async listThreads(): Promise<ThreadSummary[]> {
      return (await runtime.listThreads()).map(mapThread);
    },
    async switchThread(threadId) {
      await runtime.switchThread(threadId);
      const messages = await runtime.listThreadMessages(threadId, 100);
      return { threadId, messages: messages.map(mapMessage) };
    },
    async deleteThread(threadId) {
      await runtime.deleteThread(threadId);
    },
    respondToApproval(input) {
      approvalResponders.get(input.approvalId)?.(input.decision);
      approvalResponders.delete(input.approvalId);
    },
    respondToQuestion(input: QuestionResponse) {
      questionResponders.get(input.questionId)?.(input.answer);
      questionResponders.delete(input.questionId);
    },
  };

  return createAgentSessionController(driver);
}

function createDefaultRuntime(): NodeSessionRuntime {
  return {
    run: runWithMastraHarness,
    abort: () => getSingleton()?.harness.abort?.(),
    listThreads: listMastraThreads,
    switchThread: switchMastraThread,
    deleteThread: deleteMastraThread,
    listThreadMessages: listMastraThreadMessages,
  };
}

function mapThread(thread: HarnessThread): ThreadSummary {
  return {
    id: thread.id,
    title: thread.title,
    createdAt: toIsoString(thread.createdAt),
    updatedAt: toIsoString(thread.updatedAt),
    tokenUsage: thread.tokenUsage,
    metadata:
      thread.metadata && typeof thread.metadata === "object"
        ? (thread.metadata as Record<string, unknown>)
        : undefined,
  };
}

function mapMessage(message: HarnessMessage): SessionMessage {
  return {
    id: message.id,
    role: normalizeRole(message.role),
    content: extractMessageText(message.content),
    createdAt: toIsoString(message.createdAt),
  };
}

function normalizeRole(role: string): SessionMessage["role"] {
  return role === "user" ||
    role === "assistant" ||
    role === "system" ||
    role === "tool" ||
    role === "tool_call"
    ? role
    : "system";
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : JSON.stringify(content);
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
      return "";
    })
    .join("");
}

function toIsoString(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
