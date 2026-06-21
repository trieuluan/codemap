import assert from "node:assert/strict";
import test from "node:test";
import type { AgentLoopResult } from "@codemap-ai/core/agent";
import type { HarnessEvent, MastraHarness } from "../events.ts";
import { runHarness } from "./harness-runner.ts";

type EventListener = (event: HarnessEvent) => void;

function createMockHarness() {
  const listeners: EventListener[] = [];
  const respondToToolSuspensionCalls: unknown[] = [];
  const setStateCalls: unknown[] = [];
  const sendSignalCalls: unknown[] = [];
  let currentModeId = "plan";
  let state: Record<string, unknown> = {};

  const harness = {
    subscribe(listener: EventListener) {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    sendMessage: async () => {},
    respondToToolSuspension: async (input: unknown) => {
      respondToToolSuspensionCalls.push(input);
    },
    setState: async (input: unknown) => {
      setStateCalls.push(input);
      state = { ...state, ...(input as Record<string, unknown>) };
    },
    getState: () => state,
    sendSignal: (input: unknown) => {
      sendSignalCalls.push(input);
      return {
        id: "sig_1",
        type: "system-reminder",
        accepted: Promise.resolve({ accepted: true, runId: "run_1" }),
      };
    },
    getCurrentModelId: () => "test-model",
    getCurrentMode: () => ({ id: currentModeId }),
  } as unknown as MastraHarness;

  return {
    harness,
    respondToToolSuspensionCalls,
    setStateCalls,
    sendSignalCalls,
    setMode(modeId: string) {
      currentModeId = modeId;
    },
    emit(event: HarnessEvent) {
      for (const listener of [...listeners]) listener(event);
    },
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("runHarness continues into build after plan-mode submit_plan approval", async () => {
  const mock = createMockHarness();

  const resultPromise = runHarness(
    mock.harness,
    { role: "user", content: "Create a test plan" },
    undefined,
    {
      onPlanWait: async () => "apply",
    },
  );

  mock.emit({
    type: "tool_suspended",
    toolCallId: "plan_1",
    toolName: "submit_plan",
    suspendPayload: { plan: "# Plan\nDo it" },
  } as HarnessEvent);

  await new Promise((r) => setTimeout(r, 10));
  assert.equal(mock.setStateCalls.length, 2);
  const stateCall = mock.setStateCalls[0] as {
    activePlan: { title: string; plan: string; approvedAt: string };
  };
  assert.equal(stateCall.activePlan.title, "Plan ready");
  assert.equal(stateCall.activePlan.plan, "# Plan\nDo it");
  assert.match(stateCall.activePlan.approvedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(mock.setStateCalls[1], {
    permissionRules: {
      categories: {},
      tools: { submit_plan: "deny" },
    },
  });
  assert.deepEqual(mock.respondToToolSuspensionCalls, [
    {
      resumeData: { action: "approved" },
      toolCallId: "plan_1",
    },
  ]);
  assert.deepEqual(mock.sendSignalCalls, [
    {
      type: "system-reminder",
      contents:
        "The user has approved the plan. You are now in Build mode. Do not call or discuss submit_plan again; use the approved plan from activePlan and execute it. If the approved plan is only testing the plan-approval flow, briefly confirm that approval was received and stop.",
    },
  ]);

  mock.emit({ type: "agent_end", reason: "aborted" } as HarnessEvent);
  await assert.rejects(
    () => withTimeout<AgentLoopResult>(resultPromise, 20),
    /Timed out/,
  );

  mock.setMode("build");
  mock.emit({ type: "mode_changed", modeId: "build" } as HarnessEvent);
  mock.emit({
    type: "message_update",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Implemented the plan." }],
    },
  } as HarnessEvent);
  mock.emit({ type: "agent_end", reason: "complete" } as HarnessEvent);

  const result = await withTimeout<AgentLoopResult>(resultPromise, 100);

  assert.equal(result.text, "Implemented the plan.");
});

test("runHarness rejects submit_plan outside plan mode without starting build", async () => {
  const mock = createMockHarness();
  mock.setMode("build");

  const resultPromise = runHarness(
    mock.harness,
    { role: "user", content: "Create a test plan" },
    undefined,
    {
      onPlanWait: async () => "apply",
    },
  );

  mock.emit({
    type: "tool_suspended",
    toolCallId: "plan_1",
    toolName: "submit_plan",
    suspendPayload: { title: "Bad plan", plan: "# Plan\nDo it" },
  } as HarnessEvent);

  await new Promise((r) => setTimeout(r, 10));

  assert.deepEqual(mock.respondToToolSuspensionCalls, [
    {
      resumeData: {
        action: "rejected",
        feedback:
          "submit_plan is only available in Plan mode. Switch to Plan mode and submit the plan again.",
      },
      toolCallId: "plan_1",
    },
  ]);
  assert.equal(mock.sendSignalCalls.length, 0);
  assert.deepEqual(mock.setStateCalls, []);

  mock.emit({
    type: "message_update",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "submit_plan is only available in Plan mode." }],
    },
  } as HarnessEvent);
  mock.emit({ type: "agent_end", reason: "complete" } as HarnessEvent);

  const result = await withTimeout<AgentLoopResult>(resultPromise, 100);
  assert.equal(result.text, "submit_plan is only available in Plan mode.");
});
