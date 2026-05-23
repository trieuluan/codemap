import assert from "node:assert/strict";
import test from "node:test";
import {
  bridgeCommonEvent,
  isSuppressedScratchAssistantText,
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

test("suppresses short Mastra scratch assistant text", () => {
  assert.equal(isSuppressedScratchAssistantText("Need final answer likely user asked for status."), true);
  assert.equal(isSuppressedScratchAssistantText("Need enough. read runner snippets."), true);

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

  assert.deepEqual(tokens, []);
});

test("does not suppress normal user-facing assistant text", () => {
  assert.equal(isSuppressedScratchAssistantText("Mình đã đọc qua repo. Tóm tắt nhanh:"), false);

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

test("does not suppress multi-line text even when it starts with a scratch prefix", () => {
  assert.equal(
    isSuppressedScratchAssistantText("Need final answer\nMình đã đọc qua repo."),
    false,
  );
});
