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
    executionMode: "single",
  });
});

test("classifies plan_only tasks as multi with plan_only executionMode", async () => {
  const result = await classifyTask(
    "make a plan for implementing user authentication",
    providerReturning({
      phase: "multi",
      taskType: "feature",
      reason: "user requests planning first",
      executionMode: "plan_only",
    }),
    "planner",
  );

  assert.equal(result.phase, "multi");
  assert.equal(result.taskType, "feature");
  assert.equal(result.executionMode, "plan_only");
});

test("classifies multi_execute tasks with tool calls", async () => {
  const result = await classifyTask(
    "implement full OAuth2 system across auth/web/api modules",
    providerReturning({
      phase: "multi",
      taskType: "feature",
      reason: "large feature requiring implementation",
      executionMode: "multi_execute",
    }),
    "planner",
  );

  assert.equal(result.phase, "multi");
  assert.equal(result.taskType, "feature");
  assert.equal(result.executionMode, "multi_execute");
});

test("defaults to single executionMode when missing in classifier response", async () => {
  const result = await classifyTask(
    "fix the bug in auth.ts",
    providerReturning({
      phase: "single",
      taskType: "bugfix",
      reason: "simple fix",
      // executionMode omitted
    }),
    "planner",
  );

  assert.equal(result.phase, "single");
  assert.equal(result.executionMode, "single");
});
