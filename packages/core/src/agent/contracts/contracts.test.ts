import assert from "node:assert/strict";
import test from "node:test";
import {
  agentSessionCommandSchema,
  agentSessionEventSchema,
} from "./index.ts";

test("agent session schemas accept browser-safe commands and events", () => {
  assert.equal(
    agentSessionCommandSchema.parse({
      type: "send",
      requestId: "req-1",
      input: { content: "Explain this repository" },
    }).type,
    "send",
  );

  assert.equal(
    agentSessionEventSchema.parse({
      type: "token",
      requestId: "req-1",
      text: "Hello",
    }).type,
    "token",
  );

  assert.equal(
    agentSessionEventSchema.parse({
      type: "snapshot",
      snapshot: {
        threadId: null,
        messages: [],
        status: "idle",
        streamingText: "",
        thinkingText: "",
        tools: [],
        pendingApproval: null,
        pendingQuestion: null,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        threadUsage: null,
        model: null,
        error: null,
      },
    }).type,
    "snapshot",
  );

  assert.equal(
    agentSessionCommandSchema.parse({
      type: "delete_thread",
      requestId: "req-2",
      threadId: "thread-1",
    }).type,
    "delete_thread",
  );
});

test("agent session schemas reject secrets and malformed payloads", () => {
  assert.throws(() =>
    agentSessionCommandSchema.parse({
      type: "send",
      requestId: "req-1",
      input: { content: "", apiKey: "secret" },
    }),
  );

  assert.throws(() =>
    agentSessionEventSchema.parse({
      type: "usage",
      requestId: "req-1",
      usage: { promptTokens: -1, completionTokens: 0, totalTokens: 0 },
    }),
  );
});
