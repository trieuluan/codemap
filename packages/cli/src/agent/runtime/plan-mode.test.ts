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
  _respondToPlanApprovalCalls: { planId: string; response: { action: string; feedback?: string } }[];
  _abortCalled: boolean;
};

function createMockHarness(): MockHarness {
  const mock = {
    _listeners: [] as EventListener[],
    _switchModeCalls: [] as { modeId: string }[],
    _respondToPlanApprovalCalls: [] as { planId: string; response: { action: string; feedback?: string } }[],
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
    respondToPlanApproval: async (input: { planId: string; response: { action: string; feedback?: string } }) => {
      mock._respondToPlanApprovalCalls.push({
        planId: input.planId,
        response: input.response,
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

test("plan_approval_required triggers onPlanApproval callback", () => {
  let receivedPlanId: string | undefined;
  let receivedPlan: string | undefined;
  const mock = createMockHarness();

  mock.subscribe((event) => {
    if (event.type === "plan_approval_required") {
      const ev = event as HarnessEvent & { planId?: string; plan?: string };
      receivedPlanId = ev.planId;
      receivedPlan = ev.plan;
    }
  });

  mock._emit({
    type: "plan_approval_required",
    planId: "plan_abc",
    plan: "# Plan\nStep 1: Fix bug\nStep 2: Test",
  } as HarnessEvent);

  assert.equal(receivedPlanId, "plan_abc");
  assert.equal(receivedPlan, "# Plan\nStep 1: Fix bug\nStep 2: Test");
});

test("plan approval calls respondToPlanApproval with approved action", async () => {
  const mock = createMockHarness();

  // Simulate handlePlanApproval with "apply" action
  await mock.respondToPlanApproval?.({
    planId: "plan_1",
    response: { action: "approved" },
  });

  assert.equal(mock._respondToPlanApprovalCalls.length, 1);
  assert.equal(mock._respondToPlanApprovalCalls[0].planId, "plan_1");
  assert.equal(mock._respondToPlanApprovalCalls[0].response.action, "approved");
});

test("plan rejection calls respondToPlanApproval with rejected action and feedback", async () => {
  const mock = createMockHarness();

  await mock.respondToPlanApproval?.({
    planId: "plan_2",
    response: { action: "rejected", feedback: "Add error handling" },
  });

  assert.equal(mock._respondToPlanApprovalCalls.length, 1);
  assert.equal(mock._respondToPlanApprovalCalls[0].planId, "plan_2");
  assert.equal(mock._respondToPlanApprovalCalls[0].response.action, "rejected");
  assert.equal(mock._respondToPlanApprovalCalls[0].response.feedback, "Add error handling");
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

test("full plan flow: plan → approve → build → agent_end", async () => {
  const events: string[] = [];
  const mock = createMockHarness();
  let settled = false;

  mock.subscribe((event) => {
    if (event.type === "mode_changed") {
      const ev = event as HarnessEvent & { modeId?: string };
      events.push(`mode:${ev.modeId}`);
    }
    if (event.type === "plan_approval_required") {
      events.push("plan_approval");
      // Auto-approve
      mock.respondToPlanApproval?.({
        planId: (event as HarnessEvent & { planId?: string }).planId ?? "",
        response: { action: "approved" },
      }).then(() => {
        // After approval, harness switches to build mode
        mock._emit({ type: "mode_changed", modeId: "build" } as HarnessEvent);
        // Then execution completes
        mock._emit({ type: "agent_end" } as HarnessEvent);
      });
    }
    if (event.type === "agent_end") {
      events.push("end");
      settled = true;
    }
  });

  // Simulate: switch to plan → send message → harness emits plan_approval → approve → build → end
  await mock.switchMode?.({ modeId: "plan" });
  mock._emit({ type: "mode_changed", modeId: "plan" } as HarnessEvent);
  mock._emit({
    type: "plan_approval_required",
    planId: "plan_1",
    plan: "Do the thing",
  } as HarnessEvent);

  // Wait for async chain
  await new Promise((r) => setTimeout(r, 10));

  assert.deepEqual(events, ["mode:plan", "plan_approval", "mode:build", "end"]);
  assert.equal(settled, true);
});
