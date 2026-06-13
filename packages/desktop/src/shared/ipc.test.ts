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
      availableModels: ["coder", "planner"],
      apiKey: "secret",
      apiToken: "secret-token",
    }),
    {
      provider: "9router",
      baseUrl: "http://localhost:4000/v1",
      defaultModel: "coder",
      availableModels: ["coder", "planner"],
      hasApiKey: true,
      hasApiToken: true,
    },
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
