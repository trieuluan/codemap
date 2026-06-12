import assert from "node:assert/strict";
import test from "node:test";
import type { Message } from "../../state/types.js";
import { stripAnsi } from "../../../tui/text/text.js";
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
    startedAtMs: next[1]?.startedAtMs,
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
  assert.equal(stripAnsi(toolCall?.content ?? ""), "package.json ✓");
  assert.equal(toolCall?.expandedContent, JSON.stringify({ summary: "done" }));
  assert.equal(toolCall?.toolResults?.length, 1);
  assert.equal(toolCall?.toolResults?.[0]?.content, "done");
  assert.equal(toolCall?.toolResults?.[0]?.success, true);
});

test("markToolDone treats body containing [ERROR] without prefix as success", () => {
  const messages: Message[] = [
    { role: "user", content: "go" },
    { role: "tool_call", name: "view", content: "mastra-events.ts" },
  ];

  const fileBody = "143: cb.onToolResult?.(displayName, ev.isError ? `[ERROR] ${r}` : r);";
  const next = markToolDone(messages, "view", fileBody);
  const toolCall = next[1];

  assert.equal(stripAnsi(toolCall?.content ?? ""), "mastra-events.ts ✓");
  assert.equal(toolCall?.toolResults?.[0]?.success, true);
});

test("markToolDone marks failure only when [ERROR] is the prefix", () => {
  const messages: Message[] = [
    { role: "user", content: "go" },
    { role: "tool_call", name: "view", content: "missing.ts" },
  ];

  const next = markToolDone(messages, "view", "[ERROR] File not found");
  const toolCall = next[1];

  assert.equal(stripAnsi(toolCall?.content ?? ""), "missing.ts ✗");
  assert.equal(toolCall?.toolResults?.[0]?.success, false);
});

test("markToolDone ignores duplicate tool_end results", () => {
  const messages: Message[] = [
    { role: "user", content: "go" },
    { role: "tool_call", name: "view", toolCallId: "call_1", content: "a.ts" },
  ];

  const first = markToolDone(messages, "view", JSON.stringify({ summary: "done" }), "call_1");
  const second = markToolDone(first, "view", JSON.stringify({ summary: "done" }), "call_1");
  const toolCall = second[1];

  assert.equal(stripAnsi(toolCall?.content ?? ""), "a.ts ✓");
  assert.equal(toolCall?.toolResults?.length, 1);
});

test("markToolDone matches by toolCallId when tool_end has no name", () => {
  const messages: Message[] = [
    { role: "user", content: "go" },
    { role: "tool_call", name: "write_file", toolCallId: "call_1", content: "a.txt" },
  ];

  const next = markToolDone(messages, "", JSON.stringify({ summary: "done" }), "call_1");
  const toolCall = next[1];

  assert.equal(toolCall?.role, "tool_call");
  assert.equal(stripAnsi(toolCall?.content ?? ""), "a.txt ✓");
  assert.equal(toolCall?.toolResults?.[0]?.name, "write_file");
  assert.equal(toolCall?.toolResults?.[0]?.content, "done");
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
  assert.equal(stripAnsi(next[2]?.content ?? ""), "package.json ✗");
  assert.equal(next[2]?.toolResults?.[0]?.success, false);
  assert.equal(next[2]?.toolResults?.[0]?.fullContent, "[ERROR] Canceled by user.");
});

test("markToolDone appends elapsed time when a tool_call timestamp exists", () => {
  const baseNow = 1_700_000_000_000;
  const originalDateNow = Date.now;
  Date.now = () => baseNow;

  try {
    const messages: Message[] = [
      { role: "user", content: "go" },
      {
        role: "tool_call",
        name: "run_tests",
        content: "npm run test",
        timestamp: baseNow - 1250,
      },
    ];

    const next = markToolDone(messages, "run_tests", JSON.stringify({ summary: "ok" }));
    assert.equal(stripAnsi(next[1]?.content ?? ""), "npm run test ✓ 1.3s");
  } finally {
    Date.now = originalDateNow;
  }
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
