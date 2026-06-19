import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSessionSnapshot, reduceAgentSessionEvent } from "./index.ts";

test("session reducer tracks streaming, tools, usage, and completion", () => {
  let state = createInitialSessionSnapshot();
  state = reduceAgentSessionEvent(state, {
    type: "status",
    requestId: "req-1",
    status: "running",
  });
  state = reduceAgentSessionEvent(state, {
    type: "token",
    requestId: "req-1",
    text: "Hello",
  });
  state = reduceAgentSessionEvent(state, {
    type: "tool_start",
    requestId: "req-1",
    toolCallId: "tool-1",
    name: "read_file",
    args: "{}",
  });
  state = reduceAgentSessionEvent(state, {
    type: "tool_result",
    requestId: "req-1",
    toolCallId: "tool-1",
    result: "done",
    isError: false,
  });
  state = reduceAgentSessionEvent(state, {
    type: "usage",
    requestId: "req-1",
    usage: {
      promptTokens: 3,
      completionTokens: 2,
      totalTokens: 5,
      reasoningTokens: 1,
      cachedInputTokens: 2,
      cacheCreationInputTokens: 4,
    },
  });
  state = reduceAgentSessionEvent(state, {
    type: "status",
    requestId: "req-1",
    status: "idle",
  });

  assert.equal(state.status, "idle");
  assert.equal(state.streamingText, "Hello");
  assert.equal(state.tools[0]?.result, "done");
  assert.equal(state.usage.totalTokens, 5);
  assert.equal(state.usage.reasoningTokens, 1);
  assert.equal(state.usage.cachedInputTokens, 2);
  assert.equal(state.usage.cacheCreationInputTokens, 4);
});

test("session reducer preserves thread usage on thread changes without reusing run usage", () => {
  const state = reduceAgentSessionEvent(createInitialSessionSnapshot({
    usage: {
      promptTokens: 4,
      completionTokens: 6,
      totalTokens: 10,
      reasoningTokens: 2,
      cachedInputTokens: 1,
      cacheCreationInputTokens: 3,
    },
  }), {
    type: "thread_change",
    threadId: "thread-1",
    messages: [],
    tokenUsage: {
      promptTokens: 8,
      completionTokens: 9,
      totalTokens: 17,
      reasoningTokens: 5,
      cachedInputTokens: 3,
      cacheCreationInputTokens: 2,
    },
  });

  assert.equal(state.threadUsage?.reasoningTokens, 5);
  assert.equal(state.threadUsage?.cachedInputTokens, 3);
  assert.equal(state.threadUsage?.cacheCreationInputTokens, 2);
  assert.equal(state.usage.totalTokens, 0);
  assert.equal(state.usage.reasoningTokens, undefined);
});

test("session reducer clears resolved prompts", () => {
  let state = reduceAgentSessionEvent(createInitialSessionSnapshot(), {
    type: "approval",
    requestId: "req-1",
    approval: {
      approvalId: "approval-1",
      toolCallId: "tool-1",
      toolName: "write_file",
      args: { path: "a.ts" },
    },
  });
  state = reduceAgentSessionEvent(state, {
    type: "approval_resolved",
    requestId: "req-1",
    approvalId: "approval-1",
  });

  assert.equal(state.pendingApproval, null);
});

test("session reducer stores and clears pending plan review", () => {
  let state = reduceAgentSessionEvent(createInitialSessionSnapshot(), {
    type: "plan_review",
    requestId: "req-1",
    planReview: {
      planReviewId: "plan-1",
      toolCallId: "tool-1",
      title: "Test plan",
      plan: "# Plan\nDo the thing",
    },
  });

  assert.equal(state.pendingPlanReview?.planReviewId, "plan-1");
  assert.equal(state.pendingPlanReview?.plan, "# Plan\nDo the thing");

  state = reduceAgentSessionEvent(state, {
    type: "plan_review_resolved",
    requestId: "req-1",
    planReviewId: "plan-1",
  });

  assert.equal(state.pendingPlanReview, null);
});
