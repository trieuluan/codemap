import assert from "node:assert/strict";
import test from "node:test";
import type { AgentSessionEvent } from "../contracts/index.ts";
import type { AgentSessionDriver } from "./index.ts";
import { createAgentSessionController } from "./index.ts";

test("controller emits snapshot before driver events and serializes sends", async () => {
  const pending: Array<() => void> = [];
  const driver: AgentSessionDriver = {
    async send(input, emit) {
      emit({ type: "token", requestId: input.requestId, text: input.content });
      await new Promise<void>((resolve) => pending.push(resolve));
    },
    abort() {},
    async listThreads() {
      return [];
    },
    async switchThread() {
      return { threadId: "thread-1", messages: [] };
    },
    async deleteThread() {},
    respondToApproval() {},
    respondToQuestion() {},
  };
  const controller = createAgentSessionController(driver);
  const events: AgentSessionEvent[] = [];
  controller.subscribe((event) => events.push(event));

  const first = controller.send({ requestId: "req-1", content: "one" });
  await Promise.resolve();
  await assert.rejects(
    controller.send({ requestId: "req-2", content: "two" }),
    /already running/i,
  );
  pending.shift()?.();
  await first;

  assert.deepEqual(
    events.map((event) => event.type),
    ["snapshot", "status", "token", "status"],
  );
});

test("controller forwards abort and prompt responses to the driver", () => {
  const calls: string[] = [];
  const driver: AgentSessionDriver = {
    async send() {},
    abort() {
      calls.push("abort");
    },
    async listThreads() {
      return [];
    },
    async switchThread() {
      return { threadId: "thread-1", messages: [] };
    },
    async deleteThread() {
      calls.push("delete");
    },
    respondToApproval(input) {
      calls.push(input.decision);
    },
    respondToQuestion(input) {
      calls.push(String(input.answer));
    },
  };
  const controller = createAgentSessionController(driver);

  controller.abort();
  void controller.deleteThread("thread-1");
  controller.respondToApproval({
    requestId: "req-1",
    approvalId: "approval-1",
    decision: "approve",
  });
  controller.respondToQuestion({
    requestId: "req-1",
    questionId: "question-1",
    answer: "yes",
  });

  assert.deepEqual(calls, ["abort", "delete", "approve", "yes"]);
});
