import assert from "node:assert/strict";
import test from "node:test";
import {
  desktopCommandSchema,
  redactSettingsMetadata,
  runtimeMessageSchema,
} from "./ipc.js";

test("desktop IPC accepts workspace and agent commands", () => {
  assert.equal(
    desktopCommandSchema.parse({
      type: "open_workspace",
      requestId: "req-1",
      workspacePath: "/tmp/project",
    }).type,
    "open_workspace",
  );

  assert.equal(
    desktopCommandSchema.parse({
      type: "select_workspace",
      requestId: "req-select",
    }).type,
    "select_workspace",
  );

  assert.equal(
    desktopCommandSchema.parse({
      type: "agent",
      command: {
        type: "send",
        requestId: "req-2",
        input: { content: "Explain this project" },
      },
    }).type,
    "agent",
  );

  assert.equal(
    desktopCommandSchema.parse({
      type: "agent",
      command: {
        type: "delete_thread",
        requestId: "req-3",
        threadId: "thread-1",
      },
    }).type,
    "agent",
  );
});

test("desktop IPC rejects credentials in renderer commands", () => {
  assert.throws(() =>
    desktopCommandSchema.parse({
      type: "open_workspace",
      requestId: "req-1",
      workspacePath: "/tmp/project",
      apiKey: "secret",
    }),
  );
});

test("settings metadata redacts raw credentials", () => {
  assert.deepEqual(
    redactSettingsMetadata({
      provider: "9router",
      baseUrl: "http://localhost:4000/v1",
      defaultModel: "coder",
      availableModels: [{ id: "coder" }, { id: "planner", ownedBy: "openai" }],
      apiKey: "secret",
      apiToken: "secret-token",
    }),
    {
      provider: "9router",
      baseUrl: "http://localhost:4000/v1",
      defaultModel: "coder",
      availableModels: [{ id: "coder" }, { id: "planner", ownedBy: "openai" }],
      hasApiKey: true,
      hasApiToken: true,
    },
  );
});

test("desktop IPC accepts get_working_diff command", () => {
  assert.equal(
    desktopCommandSchema.parse({
      type: "get_working_diff",
      requestId: "req-diff",
    }).type,
    "get_working_diff",
  );
});

test("desktop IPC accepts get_branch_name command", () => {
  assert.equal(
    desktopCommandSchema.parse({
      type: "get_branch_name",
      requestId: "req-branch",
    }).type,
    "get_branch_name",
  );
});

test("runtime messages require request correlation for failures", () => {
  assert.throws(() =>
    runtimeMessageSchema.parse({
      type: "request_error",
      message: "failed",
    }),
  );
});
