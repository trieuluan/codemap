import assert from "node:assert/strict";
import test from "node:test";

import { formatRuntimeStatusLines } from "./status.js";

test("formatRuntimeStatusLines reports idle runtime prompt state", () => {
  assert.deepEqual(
    formatRuntimeStatusLines({
      modelId: "claude-sonnet-4",
      threadId: "thread_123",
      displayState: null,
    }),
    [
      "",
      "Runtime:",
      "  Model:      claude-sonnet-4",
      "  Thread:     thread_123",
      "  Prompt:     idle",
    ],
  );
});

test("formatRuntimeStatusLines reports pending question prompts", () => {
  assert.deepEqual(
    formatRuntimeStatusLines({
      modelId: "claude-sonnet-4",
      threadId: "thread_123",
      displayState: {
        pendingQuestion: {
          id: "question_1",
          question: "Choose a provider?",
          options: [{ label: "A", description: "Option A" }],
          selectionMode: "single_select",
        },
      } as unknown as ReturnType<typeof import("../../agent/runtime/introspection/index.js").getMastraDisplayState>,
    }),
    [
      "",
      "Runtime:",
      "  Model:      claude-sonnet-4",
      "  Thread:     thread_123",
      "  Prompt:     waiting for question — Choose a provider?",
    ],
  );
});

test("formatRuntimeStatusLines reports pending tool approvals", () => {
  assert.deepEqual(
    formatRuntimeStatusLines({
      modelId: "claude-sonnet-4",
      threadId: "thread_123",
      displayState: {
        pendingApproval: {
          toolCallId: "call_1",
          toolName: "write_file",
          args: { path: "src/app.ts" },
        },
      } as unknown as ReturnType<typeof import("../../agent/runtime/introspection/index.js").getMastraDisplayState>,
    }),
    [
      "",
      "Runtime:",
      "  Model:      claude-sonnet-4",
      "  Thread:     thread_123",
      "  Prompt:     waiting for tool approval — write_file",
    ],
  );
});
