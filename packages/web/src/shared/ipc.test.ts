import assert from "node:assert/strict";
import test from "node:test";
import {
  webCommandSchema,
  redactSettingsMetadata,
  runtimeMessageSchema,
} from "./ipc.js";

test("web API accepts agent commands", () => {
  assert.equal(
    webCommandSchema.parse({
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
    webCommandSchema.parse({
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
    webCommandSchema.parse({
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

test("web API rejects credentials in renderer commands", () => {
  assert.throws(() =>
    webCommandSchema.parse({
      type: "read_settings",
      requestId: "req-1",
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

test("web API accepts get_working_diff command", () => {
  assert.equal(
    webCommandSchema.parse({
      type: "get_working_diff",
      requestId: "req-diff",
    }).type,
    "get_working_diff",
  );
});

test("web API accepts get_working_diff_files command", () => {
  assert.equal(
    webCommandSchema.parse({
      type: "get_working_diff_files",
      requestId: "req-diff-files",
    }).type,
    "get_working_diff_files",
  );
});

test("web API accepts get_branch_name command", () => {
  assert.equal(
    webCommandSchema.parse({
      type: "get_branch_name",
      requestId: "req-branch",
    }).type,
    "get_branch_name",
  );
});

test("web API accepts get_mcp_status command", () => {
  assert.equal(
    webCommandSchema.parse({
      type: "get_mcp_status",
      requestId: "req-mcp",
    }).type,
    "get_mcp_status",
  );
});

test("web API accepts run_slash_command command", () => {
  const parsed = webCommandSchema.parse({
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


test("web API fixes workspace at server startup", () => {
  for (const type of ["select_workspace", "open_workspace", "open_url"]) {
    assert.equal(webCommandSchema.safeParse({type, requestId:"req"}).success, false);
  }
  assert.equal(webCommandSchema.parse({type:"retry_index", requestId:"req"}).type,"retry_index");
});

test("index progress is a validated runtime event", () => {
  assert.equal(runtimeMessageSchema.parse({type:"index_status",index:{status:"indexing"}}).type,"index_status");
  assert.equal(runtimeMessageSchema.safeParse({type:"index_status",index:{status:"unknown"}}).success,false);
});
