import assert from "node:assert/strict";
import test from "node:test";
import type { AgentSessionEvent } from "@codemap-ai/core/agent/contracts";
import { createNodeAgentSession } from "./create-node-agent-session.ts";

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
