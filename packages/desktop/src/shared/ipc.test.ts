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
        input: {
          content: "Explain this project",
          images: [
            {
              data: "base64-image",
              mimeType: "image/png",
              filename: "diagram.png",
            },
          ],
        },
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

  assert.equal(
    desktopCommandSchema.parse({
      type: "agent",
      command: {
        type: "respond_plan_review",
        requestId: "req-4",
        response: {
          requestId: "req-4",
          planReviewId: "plan-1",
          action: "revise",
          feedback: "Add acceptance criteria",
        },
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

test("desktop IPC accepts get_working_diff_files command", () => {
  assert.equal(
    desktopCommandSchema.parse({
      type: "get_working_diff_files",
      requestId: "req-diff-files",
    }).type,
    "get_working_diff_files",
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

test("desktop IPC accepts get_mcp_status command", () => {
  assert.equal(
    desktopCommandSchema.parse({
      type: "get_mcp_status",
      requestId: "req-mcp",
    }).type,
    "get_mcp_status",
  );
});

test("desktop IPC accepts run_slash_command command", () => {
  const parsed = desktopCommandSchema.parse({
    type: "run_slash_command",
    requestId: "req-slash",
    name: "help",
    args: "",
  });
  assert.equal(parsed.type, "run_slash_command");
  assert.equal(parsed.name, "help");
  assert.equal(parsed.args, "");
});

test("runtime messages require request correlation for failures", () => {
  assert.throws(() =>
    runtimeMessageSchema.parse({
      type: "request_error",
      message: "failed",
    }),
  );
});
