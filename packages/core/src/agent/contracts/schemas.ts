import { z } from "zod";

const requestIdSchema = z.string().min(1);
const usageSchema = z
  .object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative().optional(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    cacheCreationInputTokens: z.number().int().nonnegative().optional(),
    raw: z.unknown().optional(),
  })
  .strict();
const sessionMessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(["system", "user", "assistant", "tool", "tool_call"]),
    content: z.unknown(),
    createdAt: z.string().optional(),
    toolCallId: z.string().optional(),
    name: z.string().optional(),
  })
  .strict();
const approvalSchema = z
  .object({
    approvalId: z.string().min(1),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    args: z.record(z.string(), z.unknown()),
  })
  .strict();
const questionSchema = z
  .object({
    questionId: z.string().min(1),
    question: z.string().min(1),
    options: z
      .array(
        z
          .object({
            label: z.string(),
            description: z.string().optional(),
            value: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    selectionMode: z.enum(["single_select", "multi_select"]).optional(),
  })
  .strict();
const planReviewSchema = z
  .object({
    planReviewId: z.string().min(1),
    toolCallId: z.string().min(1),
    title: z.string().optional(),
    plan: z.string(),
  })
  .strict();
const toolCallSchema = z
  .object({
    toolCallId: z.string(),
    name: z.string(),
    args: z.string(),
    preview: z.string().optional(),
    result: z.string().optional(),
    isError: z.boolean().optional(),
  })
  .strict();
const sendInputSchema = z
  .object({
    content: z.string(),
    model: z.string().optional(),
    mode: z.enum(["build", "plan", "fast"]).optional(),
    images: z
      .array(
        z
          .object({
            data: z.string().min(1),
            mimeType: z.string().min(1),
            filename: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const agentSessionCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("send"),
      requestId: requestIdSchema,
      input: sendInputSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("abort"), requestId: requestIdSchema })
    .strict(),
  z
    .object({ type: z.literal("list_threads"), requestId: requestIdSchema })
    .strict(),
  z
    .object({
      type: z.literal("switch_thread"),
      requestId: requestIdSchema,
      threadId: z.string().min(1),
    })
    .strict(),
  z
    .object({ type: z.literal("new_thread"), requestId: requestIdSchema })
    .strict(),
  z
    .object({
      type: z.literal("delete_thread"),
      requestId: requestIdSchema,
      threadId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("respond_approval"),
      requestId: requestIdSchema,
      response: z
        .object({
          requestId: requestIdSchema,
          approvalId: z.string().min(1),
          decision: z.enum(["approve", "decline", "always_allow_category"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("respond_question"),
      requestId: requestIdSchema,
      response: z
        .object({
          requestId: requestIdSchema,
          questionId: z.string().min(1),
          answer: z.union([z.string(), z.array(z.string())]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("respond_plan_review"),
      requestId: requestIdSchema,
      response: z
        .object({
          requestId: requestIdSchema,
          planReviewId: z.string().min(1),
          action: z.enum(["apply", "reject", "revise"]),
          feedback: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
]);

const statusSchema = z.enum([
  "idle",
  "running",
  "aborting",
  "disconnected",
  "error",
]);
const threadChangeSchema = z
  .object({
    threadId: z.string(),
    messages: z.array(sessionMessageSchema),
    tokenUsage: usageSchema.optional(),
    systemPrompt: z.string().optional(),
  })
  .strict();
const sessionSnapshotSchema = z
  .object({
    threadId: z.string().nullable(),
    messages: z.array(sessionMessageSchema),
    status: statusSchema,
    streamingText: z.string(),
    thinkingText: z.string(),
    tools: z.array(toolCallSchema),
    pendingApproval: approvalSchema.nullable(),
    pendingQuestion: questionSchema.nullable(),
    pendingPlanReview: planReviewSchema.nullable(),
    usage: usageSchema,
    threadUsage: usageSchema.nullable(),
    model: z.string().nullable(),
    error: z.string().nullable(),
    systemPrompt: z.string().optional(),
  })
  .strict();

export const agentSessionEventSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("snapshot"), snapshot: sessionSnapshotSchema })
    .strict(),
  z.object({ type: z.literal("status"), requestId: requestIdSchema.optional(), status: statusSchema }).strict(),
  z.object({ type: z.literal("token"), requestId: requestIdSchema, text: z.string() }).strict(),
  z.object({ type: z.literal("thinking"), requestId: requestIdSchema, text: z.string() }).strict(),
  z.object({ type: z.literal("model"), requestId: requestIdSchema.optional(), model: z.string() }).strict(),
  z
    .object({
      type: z.literal("tool_start"),
      requestId: requestIdSchema,
      toolCallId: z.string(),
      name: z.string(),
      args: z.string(),
      preview: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool_result"),
      requestId: requestIdSchema,
      toolCallId: z.string(),
      result: z.string(),
      isError: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal("approval"), requestId: requestIdSchema, approval: approvalSchema }).strict(),
  z.object({ type: z.literal("approval_resolved"), requestId: requestIdSchema, approvalId: z.string() }).strict(),
  z.object({ type: z.literal("question"), requestId: requestIdSchema, question: questionSchema }).strict(),
  z.object({ type: z.literal("question_resolved"), requestId: requestIdSchema, questionId: z.string() }).strict(),
  z.object({ type: z.literal("plan_review"), requestId: requestIdSchema, planReview: planReviewSchema }).strict(),
  z.object({ type: z.literal("plan_review_resolved"), requestId: requestIdSchema, planReviewId: z.string() }).strict(),
  z.object({ type: z.literal("usage"), requestId: requestIdSchema.optional(), usage: usageSchema }).strict(),
  threadChangeSchema.extend({ type: z.literal("thread_change") }),
  z.object({ type: z.literal("error"), requestId: requestIdSchema.optional(), message: z.string() }).strict(),
]);
