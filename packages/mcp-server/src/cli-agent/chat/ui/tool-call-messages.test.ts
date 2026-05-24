import assert from "node:assert/strict";
import test from "node:test";
import type { Message } from "./store.js";
import {
  appendToLastToolCallSummary,
  markLastPendingToolCallCanceled,
  markToolDone,
  withToolCallSummary,
} from "./tool-call-messages.js";

test("withToolCallSummary creates and reuses a matching tool_call", () => {
  const messages: Message[] = [{ role: "user", content: "go" }];
  const next = withToolCallSummary(
    messages,
    "server__get_file",
    JSON.stringify({ path: "package.json" }),
    "call_1",
  );

  assert.equal(next.length, 2);
  assert.deepEqual(next[1], {
    role: "tool_call",
    name: "get_file",
    toolCallId: "call_1",
    content: "package.json",
    timestamp: next[1]?.timestamp,
  });

  const reused = withToolCallSummary(next, "server__get_file", "{}", "call_1");
  assert.equal(reused.length, 2);
});

test("markToolDone attaches a tool result to the latest matching tool_call", () => {
  const messages: Message[] = [
    { role: "user", content: "go" },
    { role: "tool_call", name: "get_file", content: "package.json" },
  ];

  const next = markToolDone(messages, "get_file", JSON.stringify({ summary: "done" }));
  const toolCall = next[1];

  assert.equal(toolCall?.role, "tool_call");
  assert.equal(toolCall?.content, "package.json ✓");
  assert.equal(toolCall?.expandedContent, JSON.stringify({ summary: "done" }));
  assert.equal(toolCall?.toolResults?.length, 1);
  assert.equal(toolCall?.toolResults?.[0]?.content, "done");
  assert.equal(toolCall?.toolResults?.[0]?.success, true);
});

test("markLastPendingToolCallCanceled only marks pending tool calls", () => {
  const messages: Message[] = [
    { role: "user", content: "go" },
    {
      role: "tool_call",
      name: "search",
      content: "old ✓",
      toolResults: [{ name: "search", content: "ok", success: true }],
    },
    { role: "tool_call", name: "get_file", content: "package.json" },
  ];

  const next = markLastPendingToolCallCanceled(messages);

  assert.equal(next[1]?.toolResults?.length, 1);
  assert.equal(next[2]?.content, "package.json ✗");
  assert.equal(next[2]?.toolResults?.[0]?.success, false);
  assert.equal(next[2]?.toolResults?.[0]?.fullContent, "[ERROR] Canceled by user.");
});

test("appendToLastToolCallSummary appends preview text to expandedContent", () => {
  const messages: Message[] = [
    { role: "user", content: "go" },
    { role: "tool_call", name: "edit_file", content: "src/a.ts" },
  ];

  const first = appendToLastToolCallSummary(messages, "preview 1");
  assert.equal(first[1]?.expandedContent, "preview 1");

  const second = appendToLastToolCallSummary(first, "preview 2");
  assert.equal(second[1]?.expandedContent, "preview 1\npreview 2");
});
