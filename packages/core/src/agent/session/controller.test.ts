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
      return {
        threadId: "thread-1",
        messages: [],
        tokenUsage: {
          promptTokens: 7,
          completionTokens: 5,
          totalTokens: 12,
          reasoningTokens: 2,
          cachedInputTokens: 3,
          cacheCreationInputTokens: 1,
        },
      };
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

test("controller propagates thread token usage on switch", async () => {
  const driver: AgentSessionDriver = {
    async send() {},
    abort() {},
    async listThreads() {
      return [];
    },
    async switchThread() {
      return {
        threadId: "thread-2",
        messages: [],
        tokenUsage: {
          promptTokens: 11,
          completionTokens: 13,
          totalTokens: 24,
          reasoningTokens: 4,
          cachedInputTokens: 6,
          cacheCreationInputTokens: 2,
        },
      };
    },
    async deleteThread() {},
    respondToApproval() {},
    respondToQuestion() {},
  };

  const controller = createAgentSessionController(driver);
  const events: AgentSessionEvent[] = [];
  controller.subscribe((event) => events.push(event));

  const snapshot = await controller.switchThread("thread-2");

  const lastEvent = events.at(-1);
  assert.ok(lastEvent && lastEvent.type === "thread_change");
  assert.equal(lastEvent.threadId, "thread-2");
  assert.deepEqual(lastEvent.tokenUsage, {
    promptTokens: 11,
    completionTokens: 13,
    totalTokens: 24,
    reasoningTokens: 4,
    cachedInputTokens: 6,
    cacheCreationInputTokens: 2,
  });
  assert.equal(snapshot.threadUsage?.reasoningTokens, 4);
  assert.equal(snapshot.threadUsage?.cachedInputTokens, 6);
  assert.equal(snapshot.usage.totalTokens, 0);
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
      return {
        threadId: "thread-1",
        messages: [],
        tokenUsage: {
          promptTokens: 7,
          completionTokens: 5,
          totalTokens: 12,
          reasoningTokens: 2,
          cachedInputTokens: 3,
          cacheCreationInputTokens: 1,
        },
      };
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
