import assert from "node:assert/strict";
import test from "node:test";
import type { AgentSessionEvent } from "@codemap-ai/core/agent/contracts";
import type { HarnessMessage } from "@codemap-ai/runtime-node/events";
import { createNodeAgentSession } from "./create-node-agent-session.ts";

/** Minimal HarnessMessage factory — cast via unknown to avoid exhaustive content union */
function makeAssistantMessage(content: Array<{ type: string; [k: string]: unknown }>): HarnessMessage {
  return {
    id: "msg-1",
    role: "assistant",
    content: content as unknown as HarnessMessage["content"],
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };
}

test("switchThread expands tool_call/tool_result content parts into synthetic SessionMessages", async () => {
  const session = createNodeAgentSession({
    provider: { baseUrl: "http://localhost", apiKey: undefined },
    model: "coder",
    toolClient: {
      getServerConfig: () => ({ command: "node" }),
      getExtraServerConfigs: () => ({}),
    },
    runtime: {
      async run() {
        return { text: "", messages: [], usedTools: false, unsupportedToolCalling: false };
      },
      abort() {},
      async listThreads() { return []; },
      async switchThread() {},
      async deleteThread() {},
      async listThreadMessages() {
        return [
          makeAssistantMessage([
            { type: "text", text: "Let me read that file." },
            { type: "tool_call", id: "call-1", name: "read_file", args: { path: "src/index.ts" } },
            { type: "tool_result", id: "call-1", name: "read_file", result: "export const x = 1;", isError: false },
          ]),
        ];
      },
    },
  });

  const events: AgentSessionEvent[] = [];
  session.subscribe((e) => events.push(e));
  await session.switchThread("thread-1");

  const threadChange = events.find((e) => e.type === "thread_change");
  assert.ok(threadChange && threadChange.type === "thread_change");

  const messages = threadChange.messages;
  assert.equal(messages.length, 3);

  // 1st: assistant text message
  assert.equal(messages[0].role, "assistant");
  assert.equal(messages[0].content, "Let me read that file.");

  // 2nd: synthetic tool_call message
  assert.equal(messages[1].role, "tool_call");
  assert.equal(messages[1].toolCallId, "call-1");
  assert.equal(messages[1].name, "read_file");
  assert.equal(messages[1].content, JSON.stringify({ path: "src/index.ts" }));

  // 3rd: synthetic tool result message
  assert.equal(messages[2].role, "tool");
  assert.equal(messages[2].toolCallId, "call-1");
  assert.equal(messages[2].name, "read_file");
  assert.equal(messages[2].content, "export const x = 1;");
});

test("switchThread preserves text-only assistant messages without synthetic tool messages", async () => {
  const session = createNodeAgentSession({
    provider: { baseUrl: "http://localhost", apiKey: undefined },
    model: "coder",
    toolClient: {
      getServerConfig: () => ({ command: "node" }),
      getExtraServerConfigs: () => ({}),
    },
    runtime: {
      async run() {
        return { text: "", messages: [], usedTools: false, unsupportedToolCalling: false };
      },
      abort() {},
      async listThreads() { return []; },
      async switchThread() {},
      async deleteThread() {},
      async listThreadMessages() {
        return [
          makeAssistantMessage([{ type: "text", text: "Hello!" }]),
        ];
      },
    },
  });

  const events: AgentSessionEvent[] = [];
  session.subscribe((e) => events.push(e));
  await session.switchThread("thread-1");

  const threadChange = events.find((e) => e.type === "thread_change");
  assert.ok(threadChange && threadChange.type === "thread_change");
  assert.equal(threadChange.messages.length, 1);
  assert.equal(threadChange.messages[0].role, "assistant");
  assert.equal(threadChange.messages[0].content, "Hello!");
});

test("node session maps runtime callbacks to shared session events", async () => {
  const session = createNodeAgentSession({
    provider: { baseUrl: "http://localhost", apiKey: undefined },
    model: "coder",
    toolClient: {
      getServerConfig: () => ({ command: "node" }),
      getExtraServerConfigs: () => ({}),
    },
    runtime: {
      async run(input) {
        input.onToken?.("hello");
        input.onToolStart?.("read_file", "{}", "tool-1");
        input.onToolResult?.("read_file", "done", "tool-1");
        input.onUsage?.({
          promptTokens: 2,
          completionTokens: 1,
          totalTokens: 3,
        });
        return {
          text: "hello",
          messages: [],
          usedTools: true,
          unsupportedToolCalling: false,
        };
      },
      abort() {},
      async listThreads() {
        return [];
      },
      async switchThread() {},
      async deleteThread() {},
      async listThreadMessages() {
        return [];
      },
    },
  });
  const events: AgentSessionEvent[] = [];
  session.subscribe((event) => events.push(event));

  await session.send({ requestId: "req-1", content: "hello" });

  assert.deepEqual(
    events.map((event) => event.type),
    ["snapshot", "status", "token", "tool_start", "tool_result", "usage", "status"],
  );
});

test("node session resolves approvals without exposing callbacks as events", async () => {
  let decision = "";
  const session = createNodeAgentSession({
    provider: { baseUrl: "http://localhost", apiKey: undefined },
    model: "coder",
    toolClient: {
      getServerConfig: () => ({ command: "node" }),
      getExtraServerConfigs: () => ({}),
    },
    runtime: {
      async run(input) {
        input.onToolApproval?.(
          {
            toolCallId: "tool-1",
            toolName: "write_file",
            args: { path: "a.ts" },
          },
          (value) => {
            decision = value;
          },
        );
        return {
          text: "",
          messages: [],
          usedTools: false,
          unsupportedToolCalling: false,
        };
      },
      abort() {},
      async listThreads() {
        return [];
      },
      async switchThread() {},
      async deleteThread() {},
      async listThreadMessages() {
        return [];
      },
    },
  });

  await session.send({ requestId: "req-1", content: "edit" });
  session.respondToApproval({
    requestId: "req-1",
    approvalId: "tool-1",
    decision: "approve",
  });

  assert.equal(decision, "approve");
});
