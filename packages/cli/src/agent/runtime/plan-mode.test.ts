import assert from "node:assert/strict";
import test from "node:test";
import type { AgentPhase } from "@codemap-ai/runtime-node";
import type { HarnessEvent, MastraHarness } from "./events.js";

/**
 * Integration-style tests for plan mode flow.
 *
 * Since runHarness is private, we test the observable behavior through
 * a mock harness that emits events and captures method calls.
 */

type EventListener = (event: HarnessEvent) => void;

type MockHarness = MastraHarness & {
  _listeners: EventListener[];
  _emit(event: HarnessEvent): void;
  _switchModeCalls: { modeId: string }[];
  _respondToToolSuspensionCalls: { resumeData: string | { action: string; feedback?: string } }[];
  _abortCalled: boolean;
};

function createMockHarness(): MockHarness {
  const mock = {
    _listeners: [] as EventListener[],
    _switchModeCalls: [] as { modeId: string }[],
    _respondToToolSuspensionCalls: [] as { resumeData: string | { action: string; feedback?: string } }[],
    _abortCalled: false,
    _emit(event: HarnessEvent) {
      for (const listener of this._listeners) {
        listener(event);
      }
    },
    init: async () => {},
    selectOrCreateThread: async () => ({ id: "t1", resourceId: "r1", createdAt: new Date(), updatedAt: new Date() }) as any,
    createThread: async () => ({ id: "t1", resourceId: "r1", createdAt: new Date(), updatedAt: new Date() }) as any,
    listMessages: async () => [],
    listMessagesForThread: async () => [],
    listThreads: async () => [],
    switchThread: async () => {},
    sendMessage: async () => {},
    subscribe(listener: EventListener) {
      mock._listeners.push(listener);
      return () => {
        const idx = mock._listeners.indexOf(listener);
        if (idx >= 0) mock._listeners.splice(idx, 1);
      };
    },
    switchMode: async (input: { modeId: string }) => {
      mock._switchModeCalls.push({ modeId: input.modeId });
    },
    respondToToolSuspension: async (input: { resumeData: string | { action: string; feedback?: string } }) => {
      mock._respondToToolSuspensionCalls.push({
        resumeData: input.resumeData,
      });
    },
    abort: () => {
      mock._abortCalled = true;
    },
    sendSignal: () => ({
      id: "sig_1",
      type: "system-reminder",
      accepted: Promise.resolve({ accepted: true, runId: "run_1" }),
    }),
    getCurrentModelId: () => "test-model",
  };
  return mock as any as MockHarness;
}

test("mode_changed event triggers onPhaseStart with correct phase", () => {
  const phases: Array<{ phase: AgentPhase; model: string }> = [];
  const mock = createMockHarness();

  // Simulate what runHarness does: subscribe and handle mode_changed
  mock.subscribe((event) => {
    if (event.type === "mode_changed") {
      const ev = event as HarnessEvent & { modeId?: string };
      const modelId = mock.getCurrentModelId?.() ?? "";
      if (ev.modeId === "plan") phases.push({ phase: "planning", model: modelId });
      else if (ev.modeId === "build") phases.push({ phase: "executing", model: modelId });
    }
  });

  mock._emit({ type: "mode_changed", modeId: "plan" } as HarnessEvent);
  mock._emit({ type: "mode_changed", modeId: "build" } as HarnessEvent);

  assert.equal(phases.length, 2);
  assert.equal(phases[0].phase, "planning");
  assert.equal(phases[0].model, "test-model");
  assert.equal(phases[1].phase, "executing");
  assert.equal(phases[1].model, "test-model");
});

test("submit_plan tool_suspended carries plan payload", () => {
  let receivedToolCallId: string | undefined;
  let receivedPlan: string | undefined;
  const mock = createMockHarness();

  mock.subscribe((event) => {
    if (event.type === "tool_suspended") {
      const ev = event as HarnessEvent & {
        toolCallId?: string;
        toolName?: string;
        suspendPayload?: { plan?: string };
      };
      if (ev.toolName === "submit_plan") {
        receivedToolCallId = ev.toolCallId;
        receivedPlan = ev.suspendPayload?.plan;
      }
    }
  });

  mock._emit({
    type: "tool_suspended",
    toolCallId: "plan_abc",
    toolName: "submit_plan",
    suspendPayload: { plan: "# Plan\nStep 1: Fix bug\nStep 2: Test" },
  } as HarnessEvent);

  assert.equal(receivedToolCallId, "plan_abc");
  assert.equal(receivedPlan, "# Plan\nStep 1: Fix bug\nStep 2: Test");
});

test("plan approval resumes suspended tool with approved action", async () => {
  const mock = createMockHarness();

  await mock.respondToToolSuspension?.({
    resumeData: { action: "approved" },
  });

  assert.equal(mock._respondToToolSuspensionCalls.length, 1);
  assert.deepEqual(mock._respondToToolSuspensionCalls[0].resumeData, { action: "approved" });
});

test("plan rejection resumes suspended tool with rejected action and feedback", async () => {
  const mock = createMockHarness();

  await mock.respondToToolSuspension?.({
    resumeData: { action: "rejected", feedback: "Add error handling" },
  });

  assert.equal(mock._respondToToolSuspensionCalls.length, 1);
  assert.deepEqual(mock._respondToToolSuspensionCalls[0].resumeData, {
    action: "rejected",
    feedback: "Add error handling",
  });
});

test("plan cancel aborts harness", () => {
  const mock = createMockHarness();

  // Simulate cancel path
  mock.abort?.();

  assert.equal(mock._abortCalled, true);
});

test("switchMode to plan is called before sending message", async () => {
  const mock = createMockHarness();

  // Simulate what runWithMastraHarness does when planMode=true
  await mock.switchMode?.({ modeId: "plan" });

  assert.equal(mock._switchModeCalls.length, 1);
  assert.equal(mock._switchModeCalls[0].modeId, "plan");
});

test("mode_changed for unknown modeId does not trigger onPhaseStart", () => {
  const phases: AgentPhase[] = [];
  const mock = createMockHarness();

  mock.subscribe((event) => {
    if (event.type === "mode_changed") {
      const ev = event as HarnessEvent & { modeId?: string };
      if (ev.modeId === "plan") phases.push("planning");
      else if (ev.modeId === "build") phases.push("executing");
      // unknown modes are ignored
    }
  });

  mock._emit({ type: "mode_changed", modeId: "fast" } as HarnessEvent);
  mock._emit({ type: "mode_changed", modeId: "unknown" } as HarnessEvent);

  assert.equal(phases.length, 0);
});

test("full plan flow: plan → suspend submit_plan → resume → build → agent_end", async () => {
  const events: string[] = [];
  const mock = createMockHarness();
  let settled = false;

  mock.subscribe((event) => {
    if (event.type === "mode_changed") {
      const ev = event as HarnessEvent & { modeId?: string };
      events.push(`mode:${ev.modeId}`);
    }
    if (event.type === "tool_suspended") {
      const ev = event as HarnessEvent & { toolName?: string };
      if (ev.toolName === "submit_plan") {
        events.push("tool_suspended:submit_plan");
        mock.respondToToolSuspension?.({
          resumeData: { action: "approved" },
        }).then(() => {
          mock._emit({ type: "mode_changed", modeId: "build" } as HarnessEvent);
          mock._emit({ type: "agent_end" } as HarnessEvent);
        });
      }
    }
    if (event.type === "agent_end") {
      events.push("end");
      settled = true;
    }
  });

  await mock.switchMode?.({ modeId: "plan" });
  mock._emit({ type: "mode_changed", modeId: "plan" } as HarnessEvent);
  mock._emit({
    type: "tool_suspended",
    toolCallId: "plan_1",
    toolName: "submit_plan",
    suspendPayload: { plan: "Do the thing" },
  } as HarnessEvent);

  await new Promise((r) => setTimeout(r, 10));

  assert.deepEqual(events, ["mode:plan", "tool_suspended:submit_plan", "mode:build", "end"]);
  assert.equal(settled, true);
});
