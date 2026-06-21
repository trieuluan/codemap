import {
  type AgentSessionController,
  type ApprovalResponse,
  type PlanReviewResponse,
  type QuestionResponse,
  type SessionMessage,
  type ThreadSummary,
} from "@codemap-ai/core/agent/contracts";
import { randomUUID } from "node:crypto";
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
  const planReviewResponders = new Map<
    string,
    (response: PlanReviewResponse) => void
  >();
  const messagesCache = new Map<string, SessionMessage[]>();
  let currentThreadId: string | null = null;
  let pendingPlanReview:
    | { planReviewId: string; toolCallId: string; title?: string; plan: string }
    | null = null;

  const driver: AgentSessionDriver = {
    getSystemPrompt() {
      return options.agentInstructions;
    },
    async send(input, emit) {
      const abortController = new AbortController();
      activeAbortController = abortController;
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
          signal: abortController.signal,
          mode: input.mode,
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
          onPlanReady: (plan, toolCallId, title) => {
            const id = toolCallId || `plan-${randomUUID()}`;
            pendingPlanReview = {
              planReviewId: id,
              toolCallId: id,
              title,
              plan,
            };
          },
          onPlanWait: () => {
            const fallbackId = `plan-${randomUUID()}`;
            const planReview = pendingPlanReview ?? {
              planReviewId: fallbackId,
              toolCallId: fallbackId,
              title: "Plan ready",
              plan: "",
            };
            pendingPlanReview = planReview;
            return new Promise<string>((resolve) => {
              planReviewResponders.set(planReview.planReviewId, (response) => {
                planReviewResponders.delete(planReview.planReviewId);
                pendingPlanReview = null;
                if (response.action === "apply") {
                  resolve("apply");
                  return;
                }
                const feedback = response.feedback?.trim();
                resolve(
                  feedback ||
                    (response.action === "reject"
                      ? "Plan rejected by user."
                      : "Revise the plan."),
                );
              });
              emit({
                type: "plan_review",
                requestId: input.requestId,
                planReview,
              });
            });
          },
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
            questionResponders.set(questionId, (answer) => {
              const harnessAnswer =
                Array.isArray(answer)
                  ? { values: answer }
                  : { value: answer };
              respond(harnessAnswer as Parameters<typeof respond>[0]);
            });
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
        if (activeAbortController === abortController) {
          activeAbortController = null;
        }
      }
      // Invalidate cached messages for this thread — new messages were added
      if (currentThreadId) messagesCache.delete(currentThreadId);
    },
    abort() {
      activeAbortController?.abort();
      runtime.abort();
    },
    async listThreads(): Promise<ThreadSummary[]> {
      return (await runtime.listThreads()).map(mapThread);
    },
    async switchThread(threadId) {
      const cached = messagesCache.get(threadId);
      if (cached) {
        const result = await runtime.switchThread(threadId);
        if (result && typeof result === "object" && "ok" in result && !(result as { ok: boolean }).ok) {
          throw new Error(
            (result as { ok: false; message?: string }).message ??
              "Failed to switch thread",
          );
        }
        currentThreadId = threadId;
        const tokenUsage = (result as any)?.tokenUsage;
        return { threadId, messages: cached, tokenUsage };
      }
      const result = await runtime.switchThread(threadId);
      if (result && typeof result === "object" && "ok" in result && !(result as { ok: boolean }).ok) {
        throw new Error(
          (result as { ok: false; message?: string }).message ??
            "Failed to switch thread",
        );
      }
      currentThreadId = threadId;
      const tokenUsage = (result as any)?.tokenUsage;
      const messages = await runtime.listThreadMessages(threadId);
      const expanded = messages.flatMap(expandMessage);
      messagesCache.set(threadId, expanded);
      return { threadId, messages: expanded, tokenUsage };
    },
    async deleteThread(threadId) {
      messagesCache.delete(threadId);
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
    respondToPlanReview(input: PlanReviewResponse) {
      planReviewResponders.get(input.planReviewId)?.(input);
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
    tokenUsage: (thread.metadata as any)?.tokenUsage,
    metadata:
      thread.metadata && typeof thread.metadata === "object"
        ? (thread.metadata as Record<string, unknown>)
        : undefined,
  };
}

/**
 * Expand a single HarnessMessage into one or more SessionMessages.
 *
 * HarnessMessage uses role 'user' | 'assistant' | 'system' only.
 * Tool calls and results are embedded inside the assistant message's content[]
 * as { type: 'tool_call', id, name, args } / { type: 'tool_result', id, name, result, isError }.
 *
 * We explode each assistant message into:
 *   - an assistant SessionMessage (text only, tool_call parts stripped)
 *   - synthetic tool_call SessionMessages (one per tool_call part)
 *   - synthetic tool SessionMessages (one per tool_result part, matched by id)
 */
function expandMessage(message: HarnessMessage): SessionMessage[] {
  const createdAt = toIsoString(message.createdAt);

  if (message.role !== "assistant") {
    return [
      {
        id: message.id,
        role: normalizeRole(message.role),
        content: extractMessageText(message.content),
        createdAt,
      },
    ];
  }

  const results: SessionMessage[] = [];

  // Text-only content for the assistant message
  const textContent = message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");

  results.push({
    id: message.id,
    role: "assistant",
    content: textContent,
    createdAt,
  });

  // Merge tool_call + tool_result parts by id
  const toolCallMap = new Map<string, { name: string; args: unknown }>();
  for (const part of message.content) {
    if (part.type === "tool_call") {
      toolCallMap.set(part.id, { name: part.name, args: part.args });
    }
  }

  for (const part of message.content) {
    if (part.type === "tool_call") {
      results.push({
        role: "tool_call",
        toolCallId: part.id,
        name: part.name,
        content: part.args != null ? JSON.stringify(part.args) : "{}",
        createdAt,
      });
    } else if (part.type === "tool_result") {
      const meta = toolCallMap.get(part.id);
      results.push({
        role: "tool",
        toolCallId: part.id,
        name: part.name || meta?.name || "tool",
        content: part.result != null
          ? typeof part.result === "string"
            ? part.result
            : JSON.stringify(part.result)
          : "",
        createdAt,
      });
    }
  }

  return results;
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
      if (typeof part !== "object" || part === null) return "";
      // Text parts
      if ("text" in part && typeof part.text === "string") return part.text;
      // Image parts — embed as inline markdown data URI (alt = filename if available)
      if (
        "type" in part && part.type === "image" &&
        "data" in part && typeof part.data === "string" &&
        "mimeType" in part && typeof part.mimeType === "string"
      ) {
        const alt = "filename" in part && typeof part.filename === "string" ? part.filename : "image";
        return `\n![${alt}](data:${part.mimeType};base64,${part.data})`;
      }
      // File parts with image media types — same treatment
      if (
        "type" in part && part.type === "file" &&
        "data" in part && typeof part.data === "string" &&
        "mediaType" in part && typeof part.mediaType === "string" &&
        part.mediaType.startsWith("image/")
      ) {
        const alt = "filename" in part && typeof part.filename === "string" ? part.filename : "image";
        return `\n![${alt}](data:${part.mediaType};base64,${part.data})`;
      }
      // Non-image files — show a marker
      if (
        "type" in part && part.type === "file" &&
        "mediaType" in part
      ) {
        const name = "filename" in part && typeof part.filename === "string"
          ? part.filename
          : "file";
        return `\n[📎 ${name}]`;
      }
      return "";
    })
    .join("");
}

function toIsoString(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
