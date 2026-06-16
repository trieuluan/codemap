import assert from "node:assert/strict";
import test from "node:test";
import type { SessionMessage } from "@codemap-ai/core/agent/contracts";
import { normalizeThreadMessages } from "./useAgentSession.js";

test("normalizeThreadMessages attaches tool calls and results to the preceding assistant message", () => {
  const messages: SessionMessage[] = [
    { id: "u1", role: "user", content: "read that file", createdAt: "" },
    { id: "a1", role: "assistant", content: "Let me read it.", createdAt: "" },
    { id: "tc1", role: "tool_call", toolCallId: "call-1", name: "read_file", content: '{"path":"src/index.ts"}', createdAt: "" },
    { id: "tr1", role: "tool", toolCallId: "call-1", name: "read_file", content: "export const x = 1;", createdAt: "" },
    { id: "a2", role: "assistant", content: "Here is the file.", createdAt: "" },
  ];

  const normalized = normalizeThreadMessages(messages);

  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].role, "user");
  assert.equal(normalized[1].role, "assistant");
  assert.equal(normalized[1].content, "Let me read it.");
  assert.ok(normalized[1].tools);
  assert.equal(normalized[1].tools.length, 1);
  assert.equal(normalized[1].tools[0].toolCallId, "call-1");
  assert.equal(normalized[1].tools[0].name, "read_file");
  assert.equal(normalized[1].tools[0].args, '{"path":"src/index.ts"}');
  assert.equal(normalized[1].tools[0].result, "export const x = 1;");
  assert.equal(normalized[2].role, "assistant");
  assert.equal(normalized[2].content, "Here is the file.");
});

test("normalizeThreadMessages keeps assistant turns that only contain tool calls", () => {
  const messages: SessionMessage[] = [
    { id: "u1", role: "user", content: "search for foo", createdAt: "" },
    { id: "a1", role: "assistant", content: "", createdAt: "" },
    { id: "tc1", role: "tool_call", toolCallId: "call-1", name: "search_content", content: '{"pattern":"foo"}', createdAt: "" },
    { id: "tr1", role: "tool", toolCallId: "call-1", name: "search_content", content: "found foo at line 5", createdAt: "" },
  ];

  const normalized = normalizeThreadMessages(messages);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].role, "user");
  assert.equal(normalized[1].role, "assistant");
  assert.equal(normalized[1].content, "");
  assert.ok(normalized[1].tools);
  assert.equal(normalized[1].tools.length, 1);
  assert.equal(normalized[1].tools[0].toolCallId, "call-1");
  assert.equal(normalized[1].tools[0].name, "search_content");
  assert.equal(normalized[1].tools[0].result, "found foo at line 5");
});
