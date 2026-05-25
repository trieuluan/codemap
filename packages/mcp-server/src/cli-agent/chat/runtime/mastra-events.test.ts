import assert from "node:assert/strict";
import test from "node:test";
import {
  bridgeCommonEvent,
  type BridgeCallbacks,
  type HarnessLike,
} from "./mastra-events.js";

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
    harness: {} as HarnessLike,
    currentStreamTextRef: ref(""),
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

  assert.match(preview ?? "", /File: src\/app\.ts/);
  assert.match(preview ?? "", /~~~typescript/);
});

test("auto-approves Mastra tool approval requests", async () => {
  let decision: unknown;
  const cb = callbacks(() => {});
  cb.harness = {
    respondToToolApproval: (input) => {
      decision = input.decision;
    },
  } as HarnessLike;

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
