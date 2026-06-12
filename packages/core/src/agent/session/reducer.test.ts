import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSessionSnapshot, reduceAgentSessionEvent } from "./index.js";

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
    usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
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
