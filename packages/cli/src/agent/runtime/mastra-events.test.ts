import assert from "node:assert/strict";
import test from "node:test";
import {
  bridgeCommonEvent,
  type BridgeCallbacks,
  type MastraHarness,
} from "./events.js";

function ref<T>(initial: T) {
  let value = initial;
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
    },
  };
}

function callbacks(onToken: (token: string) => void): BridgeCallbacks {
  return {
    onToken,
    harness: {} as MastraHarness,
    currentStreamTextRef: ref(""),
    currentThinkingRef: ref(""),
    finalTextRef: ref(""),
    usedToolsRef: ref(false),
    onEnd: () => {},
    onError: () => {},
  };
}

test("emits short Mastra scratch-looking assistant text as normal message updates", () => {
  const tokens: string[] = [];
  bridgeCommonEvent(
    {
      type: "message_update",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Need final answer likely user asked for status." }],
      },
    } as Parameters<typeof bridgeCommonEvent>[0],
    callbacks((token) => tokens.push(token)),
  );

  assert.deepEqual(tokens, ["Need final answer likely user asked for status."]);
});

test("does not suppress normal user-facing assistant text", () => {
  const tokens: string[] = [];
  bridgeCommonEvent(
    {
      type: "message_update",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Mình đã đọc qua repo. Tóm tắt nhanh:" }],
      },
    } as Parameters<typeof bridgeCommonEvent>[0],
    callbacks((token) => tokens.push(token)),
  );

  assert.deepEqual(tokens, ["Mình đã đọc qua repo. Tóm tắt nhanh:"]);
});

test("emits passive tool preview on tool_start", () => {
  let preview: string | undefined;
  const cb = callbacks(() => {});
  cb.onToolStart = (_name, _args, _id, nextPreview) => {
    preview = nextPreview;
  };

  bridgeCommonEvent(
    {
      type: "tool_start",
      toolCallId: "call_1",
      toolName: "write_file",
      args: { path: "src/app.ts", content: "export const ok = true;" },
    } as Parameters<typeof bridgeCommonEvent>[0],
    cb,
  );

  assert.match(preview ?? "", /~~~diff/);
  assert.match(preview ?? "", /diff --git a\/src\/app\.ts b\/src\/app\.ts/);
});

test("emits tool_end error message from structured result", () => {
  let result = "";
  const cb = callbacks(() => {});
  cb.onToolResult = (_name, content) => {
    result = content;
  };

  bridgeCommonEvent(
    {
      type: "tool_end",
      toolCallId: "call_1",
      toolName: "execute_command",
      isError: true,
      result: {
        error: true,
        message: "Tool input validation failed for execute_command.",
        validationErrors: { fields: { tail: { errors: ["Invalid input"] } } },
      },
    } as Parameters<typeof bridgeCommonEvent>[0],
    cb,
  );

  assert.equal(result, "[ERROR] Tool input validation failed for execute_command.");
});

test("emits non-empty fallback for blank tool_end results", () => {
  let result = "";
  const cb = callbacks(() => {});
  cb.onToolResult = (_name, content) => {
    result = content;
  };

  bridgeCommonEvent(
    {
      type: "tool_end",
      toolCallId: "call_1",
      toolName: "execute_command",
      isError: false,
      result: undefined,
    } as Parameters<typeof bridgeCommonEvent>[0],
    cb,
  );

  assert.equal(result, "Tool completed without a result.");
});

test("emits text from MCP-style content arrays", () => {
  let result = "";
  const cb = callbacks(() => {});
  cb.onToolResult = (_name, content) => {
    result = content;
  };

  bridgeCommonEvent(
    {
      type: "tool_end",
      toolCallId: "call_1",
      toolName: "codemap_get_file",
      isError: false,
      result: { content: [{ type: "text", text: "file content" }] },
    } as Parameters<typeof bridgeCommonEvent>[0],
    cb,
  );

  assert.equal(result, "file content");
});

test("routes tool_approval_required to onToolApproval callback", async () => {
  let decision: unknown;
  const cb = callbacks(() => {});
  cb.harness = {
    respondToToolApproval: (input) => {
      decision = input.decision;
    },
  } as MastraHarness;
  cb.onToolApproval = (pendingApproval, respond) => {
    respond("approve");
  };

  bridgeCommonEvent(
    {
      type: "tool_approval_required",
      toolCallId: "call_1",
      toolName: "write_file",
      args: { path: "src/app.ts", content: "export const ok = true;" },
    } as Parameters<typeof bridgeCommonEvent>[0],
    cb,
  );

  await nextTick();

  assert.equal(decision, "approve");
});

function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("routes plan_approval_required to onPlanApproval callback", () => {
  let receivedPlanId: string | undefined;
  let receivedPlan: string | undefined;
  const cb = callbacks(() => {});
  cb.onPlanApproval = (planId, plan) => {
    receivedPlanId = planId;
    receivedPlan = plan;
  };

  bridgeCommonEvent(
    {
      type: "plan_approval_required",
      planId: "plan_123",
      plan: "## Plan\n1. Do thing\n2. Do other thing",
    } as Parameters<typeof bridgeCommonEvent>[0],
    cb,
  );

  assert.equal(receivedPlanId, "plan_123");
  assert.equal(receivedPlan, "## Plan\n1. Do thing\n2. Do other thing");
});

// ── Thinking content tests ──────────────────────────────────────

test("emits thinking content via onThinking callback", () => {
  const thinkingChunks: string[] = [];
  const cb = callbacks(() => {});
  cb.onThinking = (t) => thinkingChunks.push(t);

  bridgeCommonEvent(
    {
      type: "message_update",
      message: {
        role: "assistant",
        content: [{ type: "thinking", thinking: "Let me analyze this..." }],
      },
    } as Parameters<typeof bridgeCommonEvent>[0],
    cb,
  );

  assert.deepEqual(thinkingChunks, ["Let me analyze this..."]);
});

test("emits only delta for accumulated thinking", () => {
  const thinkingChunks: string[] = [];
  const cb = callbacks(() => {});
  cb.onThinking = (t) => thinkingChunks.push(t);

  // First chunk
  bridgeCommonEvent(
    {
      type: "message_update",
      message: {
        role: "assistant",
        content: [{ type: "thinking", thinking: "Step 1: " }],
      },
    } as Parameters<typeof bridgeCommonEvent>[0],
    cb,
  );

  // Second chunk — accumulated
  bridgeCommonEvent(
    {
      type: "message_update",
      message: {
        role: "assistant",
        content: [{ type: "thinking", thinking: "Step 1: analyzing code..." }],
      },
    } as Parameters<typeof bridgeCommonEvent>[0],
    cb,
  );

  assert.deepEqual(thinkingChunks, ["Step 1: ", "analyzing code..."]);
});

test("text and thinking coexist independently", () => {
  const tokens: string[] = [];
  const thinkingChunks: string[] = [];
  const cb = callbacks((t) => tokens.push(t));
  cb.onThinking = (t) => thinkingChunks.push(t);

  bridgeCommonEvent(
    {
      type: "message_update",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Internal reasoning..." },
          { type: "text", text: "Here is my answer." },
        ],
      },
    } as Parameters<typeof bridgeCommonEvent>[0],
    cb,
  );

  assert.deepEqual(thinkingChunks, ["Internal reasoning..."]);
  assert.deepEqual(tokens, ["Here is my answer."]);
});

test("message_end flushes remaining thinking", () => {
  const thinkingChunks: string[] = [];
  const cb = callbacks(() => {});
  cb.onThinking = (t) => thinkingChunks.push(t);

  // Simulate partial thinking via message_update
  bridgeCommonEvent(
    {
      type: "message_update",
      message: {
        role: "assistant",
        content: [{ type: "thinking", thinking: "partial..." }],
      },
    } as Parameters<typeof bridgeCommonEvent>[0],
    cb,
  );

  // message_end with final thinking
  bridgeCommonEvent(
    {
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "thinking", thinking: "partial... and final thought." }],
      },
    } as Parameters<typeof bridgeCommonEvent>[0],
    cb,
  );

  assert.deepEqual(thinkingChunks, ["partial...", " and final thought."]);
});

test("ignores thinking in non-assistant messages", () => {
  const thinkingChunks: string[] = [];
  const cb = callbacks(() => {});
  cb.onThinking = (t) => thinkingChunks.push(t);

  bridgeCommonEvent(
    {
      type: "message_update",
      message: {
        role: "user",
        content: [{ type: "thinking", thinking: "user has no thinking" }],
      },
    } as Parameters<typeof bridgeCommonEvent>[0],
    cb,
  );

  assert.deepEqual(thinkingChunks, []);
});
