import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallState } from "@codemap-ai/core/agent/contracts";

import { aggregateTasks } from "./PlanTimelinePanel.js";

function tool(
  name: string,
  args: Record<string, unknown> | string,
  id = name,
): ToolCallState {
  return {
    toolCallId: id,
    name,
    args: typeof args === "string" ? args : JSON.stringify(args),
  };
}

test("aggregateTasks creates tasks from task_write in order", () => {
  const tasks = aggregateTasks([
    tool("task_write", {
      tasks: [
        { id: "one", content: "Inspect current panel", status: "completed" },
        { id: "two", content: "Apply Plan component", status: "in_progress", activeForm: "Applying Plan" },
      ],
    }),
  ]);

  assert.deepEqual(tasks, [
    { id: "one", content: "Inspect current panel", status: "completed", activeForm: undefined },
    { id: "two", content: "Apply Plan component", status: "in_progress", activeForm: "Applying Plan" },
  ]);
});

test("aggregateTasks applies task_update and task_complete", () => {
  const tasks = aggregateTasks([
    tool("task_write", {
      tasks: [
        { id: "one", content: "Inspect current panel", status: "pending" },
        { id: "two", content: "Apply Plan component", status: "pending" },
      ],
    }),
    tool("task_update", {
      id: "two",
      content: "Apply AI Elements Plan",
      status: "in_progress",
      activeForm: "Applying AI Elements Plan",
    }),
    tool("task_complete", { id: "two" }),
  ]);

  assert.deepEqual(tasks, [
    { id: "one", content: "Inspect current panel", status: "pending", activeForm: undefined },
    { id: "two", content: "Apply AI Elements Plan", status: "completed", activeForm: "Applying AI Elements Plan" },
  ]);
});

test("aggregateTasks ignores malformed and non-task tools", () => {
  const tasks = aggregateTasks([
    tool("read_file", { path: "src/app.ts" }),
    tool("task_write", "{not-json"),
    tool("task_write", { tasks: [{ id: "missing-content" }] }),
    tool("task_update", { id: "unknown", status: "completed" }),
  ]);

  assert.deepEqual(tasks, []);
});
