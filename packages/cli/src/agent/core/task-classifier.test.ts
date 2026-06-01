import assert from "node:assert/strict";
import test from "node:test";
import { classifyTask } from "./task-classifier.js";
import type { NineRouterProvider } from "./provider.js";

function providerReturning(json: object): NineRouterProvider {
  return {
    async *stream() {
      yield { text: JSON.stringify(json) };
    },
  } as unknown as NineRouterProvider;
}

test("classifies lookup tasks as single research", async () => {
  const result = await classifyTask(
    "tìm đoạn code render ask_user multi select ở đâu",
    providerReturning({
      phase: "single",
      taskType: "research",
      reason: "lookup task",
    }),
    "planner",
  );

  assert.equal(result.phase, "single");
  assert.equal(result.taskType, "research");
});

test("downgrades read-only multi classifications to single", async () => {
  const result = await classifyTask(
    "find where imports are parsed",
    providerReturning({
      phase: "multi",
      taskType: "research",
      reason: "incorrect model output",
    }),
    "planner",
  );

  assert.equal(result.phase, "single");
  assert.equal(result.taskType, "research");
});

test("keeps large coding tasks as multi", async () => {
  const result = await classifyTask(
    "implement full OAuth2 system across auth/web/api modules",
    providerReturning({
      phase: "multi",
      taskType: "feature",
      reason: "large feature",
    }),
    "planner",
  );

  assert.equal(result.phase, "multi");
  assert.equal(result.taskType, "feature");
});

test("treats short confirmation replies as continuation without model call", async () => {
  let called = false;
  const provider = {
    async *stream() {
      called = true;
      yield { text: "{}" };
    },
  } as unknown as NineRouterProvider;

  const result = await classifyTask("tiếp tục", provider, "planner");

  assert.equal(called, false);
  assert.deepEqual(result, {
    phase: "single",
    taskType: "general",
    effort: "medium",
    reason: "confirmation — continuing coding task",
  });
});
