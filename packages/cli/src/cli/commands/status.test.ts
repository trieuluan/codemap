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
        pendingSuspensions: new Map([
          [
            "question_1",
            {
              toolCallId: "question_1",
              toolName: "ask_user",
              args: { question: "Choose a provider?" },
            },
          ],
        ]),
      } as unknown as ReturnType<typeof import("@codemap-ai/runtime-node").getMastraDisplayState>,
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
      } as unknown as ReturnType<typeof import("@codemap-ai/runtime-node").getMastraDisplayState>,
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
