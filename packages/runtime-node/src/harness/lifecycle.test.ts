import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultPermissionRules, syncHarnessModeForRun } from "./lifecycle.ts";

test("createDefaultPermissionRules returns schema-compatible object state", () => {
  assert.deepEqual(createDefaultPermissionRules(), {
    categories: {},
    tools: {},
  });
});

test("syncHarnessModeForRun switches to plan mode and reports planning phase", async () => {
  const switchModeCalls: unknown[] = [];
  const setStateCalls: unknown[] = [];
  const phases: unknown[] = [];
  const models: string[] = [];
  let state = {
    permissionRules: {
      categories: {},
      tools: { submit_plan: "deny", other_tool: "allow" },
    },
  };
  const harness = {
    switchMode: async (input: unknown) => {
      switchModeCalls.push(input);
    },
    getState: () => state,
    setState: async (input: unknown) => {
      setStateCalls.push(input);
      state = { ...state, ...(input as typeof state) };
    },
    getCurrentModelId: () => "plan-model",
  };

  const model = await syncHarnessModeForRun(harness as any, true, {
    onModel: (value) => models.push(value),
    onPhaseStart: (phase, value) => phases.push({ phase, model: value }),
  });

  assert.equal(model, "plan-model");
  assert.deepEqual(switchModeCalls, [{ modeId: "plan" }]);
  assert.deepEqual(setStateCalls, [
    {
      permissionRules: {
        categories: {},
        tools: { other_tool: "allow" },
      },
    },
  ]);
  assert.deepEqual(models, ["plan-model"]);
  assert.deepEqual(phases, [{ phase: "planning", model: "plan-model" }]);
});

test("syncHarnessModeForRun switches to build mode by default and reports executing phase", async () => {
  const switchModeCalls: unknown[] = [];
  const setStateCalls: unknown[] = [];
  const phases: unknown[] = [];
  let state = {
    permissionRules: {
      categories: {},
      tools: { other_tool: "allow" },
    },
  };
  const harness = {
    switchMode: async (input: unknown) => {
      switchModeCalls.push(input);
    },
    getState: () => state,
    setState: async (input: unknown) => {
      setStateCalls.push(input);
      state = { ...state, ...(input as typeof state) };
    },
    getCurrentModelId: () => "build-model",
  };

  const model = await syncHarnessModeForRun(harness as any, false, {
    onPhaseStart: (phase, value) => phases.push({ phase, model: value }),
  });

  assert.equal(model, "build-model");
  assert.deepEqual(switchModeCalls, [{ modeId: "build" }]);
  assert.deepEqual(setStateCalls, [
    {
      permissionRules: {
        categories: {},
        tools: { other_tool: "allow", submit_plan: "deny" },
      },
    },
  ]);
  assert.deepEqual(phases, [{ phase: "executing", model: "build-model" }]);
});
