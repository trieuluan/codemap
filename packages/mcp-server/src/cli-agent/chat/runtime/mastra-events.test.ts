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
