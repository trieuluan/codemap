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
      async switchThread() { return { ok: true }; },
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
      async switchThread() { return { ok: true }; },
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
      async switchThread() { return { ok: true }; },
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
      async switchThread() { return { ok: true }; },
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

test("node session resolves submit_plan review responses", async () => {
  async function runPlanReview(
    respond: (session: ReturnType<typeof createNodeAgentSession>, id: string) => void,
  ) {
    const actions: string[] = [];
    const session = createNodeAgentSession({
      provider: { baseUrl: "http://localhost", apiKey: undefined },
      model: "coder",
      toolClient: {
        getServerConfig: () => ({ command: "node" }),
        getExtraServerConfigs: () => ({}),
      },
      runtime: {
        async run(input) {
          input.onPlanReady?.("# Plan\nDo it", "plan-1", "Test plan");
          const action = await input.onPlanWait?.();
          actions.push(String(action));
          return {
            text: "",
            messages: [],
            usedTools: false,
            unsupportedToolCalling: false,
          };
        },
        abort() {},
        async listThreads() { return []; },
        async switchThread() { return { ok: true }; },
        async deleteThread() {},
        async listThreadMessages() {
          return [];
        },
      },
    });

    const planReady = new Promise<string>((resolve) => {
      session.subscribe((event) => {
        if (event.type === "plan_review") {
          resolve(event.planReview.planReviewId);
        }
      });
    });
    const send = session.send({ requestId: "req-1", content: "plan" });
    respond(session, await planReady);
    await send;
    return actions;
  }

  assert.deepEqual(
    await runPlanReview((session, id) =>
      session.respondToPlanReview({ requestId: "req-1", planReviewId: id, action: "apply" }),
    ),
    ["apply"],
  );
  assert.deepEqual(
    await runPlanReview((session, id) =>
      session.respondToPlanReview({
        requestId: "req-1",
        planReviewId: id,
        action: "revise",
        feedback: "Add tests",
      }),
    ),
    ["Add tests"],
  );
  assert.deepEqual(
    await runPlanReview((session, id) =>
      session.respondToPlanReview({
        requestId: "req-1",
        planReviewId: id,
        action: "reject",
      }),
    ),
    ["Plan rejected by user."],
  );
});

test("switchThread reuses cached messages on second load — only calls listThreadMessages once per thread", async () => {
  let callCount = 0;
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
      async switchThread() { return { ok: true }; },
      async deleteThread() {},
      async listThreadMessages(threadId) {
        callCount++;
        return [
          makeAssistantMessage([{ type: "text", text: `msg from ${threadId}` }]),
        ];
      },
    },
  });

  // First load — should call listThreadMessages
  await session.switchThread("thread-1");
  assert.equal(callCount, 1);

  // Switch to another thread — should call again
  await session.switchThread("thread-2");
  assert.equal(callCount, 2);

  // Switch back to thread-1 — should hit cache, no new call
  await session.switchThread("thread-1");
  assert.equal(callCount, 2);

  // Verify the cached message is correct
  const events: AgentSessionEvent[] = [];
  session.subscribe((e) => events.push(e));
  await session.switchThread("thread-1");
  const lastChange = events.filter((e) => e.type === "thread_change").pop();
  assert.ok(lastChange && lastChange.type === "thread_change");
  assert.equal(lastChange.messages.length, 1);
  assert.equal(lastChange.messages[0].content, "msg from thread-1");
});

test("sending a message invalidates thread cache so next switchThread reloads", async () => {
  let callCount = 0;
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
      async switchThread() { return { ok: true }; },
      async deleteThread() {},
      async listThreadMessages() {
        callCount++;
        return [
          makeAssistantMessage([{ type: "text", text: "fresh messages" }]),
        ];
      },
    },
  });

  // Load thread-1 — messages get cached
  await session.switchThread("thread-1");
  assert.equal(callCount, 1);

  // Send a message on thread-1 — should invalidate cache
  await session.send({ requestId: "req-1", content: "hello" });
  // Switch away and back — should reload
  await session.switchThread("thread-2");
  assert.equal(callCount, 2);

  await session.switchThread("thread-1");
  assert.equal(callCount, 3, "cache was invalidated, should reload thread-1 messages");
});
