import assert from "node:assert/strict";
import test from "node:test";
import type { SessionMessage } from "@codemap-ai/core/agent/contracts";
import { normalizeThreadMessages } from "./useAgentSession.js";

test("normalizeThreadMessages preserves message and tool order", () => {
  const messages: SessionMessage[] = [
    { id: "u1", role: "user", content: "read that file", createdAt: "" },
    { id: "a1", role: "assistant", content: "Let me read it.", createdAt: "" },
    { id: "tc1", role: "tool_call", toolCallId: "call-1", name: "read_file", content: '{"path":"src/index.ts"}', createdAt: "" },
    { id: "tr1", role: "tool", toolCallId: "call-1", name: "read_file", content: "export const x = 1;", createdAt: "" },
    { id: "a2", role: "assistant", content: "Here is the file.", createdAt: "" },
  ];

  const normalized = normalizeThreadMessages(messages);

  assert.equal(normalized.length, 4);
  assert.equal(normalized[0].kind, "message");
  assert.equal(normalized[0].message.role, "user");
  assert.equal(normalized[1].kind, "message");
  assert.equal(normalized[1].message.role, "assistant");
  assert.equal(normalized[1].message.content, "Let me read it.");
  assert.equal(normalized[2].kind, "tool");
  assert.equal(normalized[2].tool.toolCallId, "call-1");
  assert.equal(normalized[2].tool.name, "read_file");
  assert.equal(normalized[2].tool.args, '{"path":"src/index.ts"}');
  assert.equal(normalized[2].tool.result, "export const x = 1;");
  assert.equal(normalized[3].kind, "message");
  assert.equal(normalized[3].message.role, "assistant");
  assert.equal(normalized[3].message.content, "Here is the file.");
});

test("normalizeThreadMessages keeps tool-only assistant activity as a tool item", () => {
  const messages: SessionMessage[] = [
    { id: "u1", role: "user", content: "search for foo", createdAt: "" },
    { id: "a1", role: "assistant", content: "", createdAt: "" },
    { id: "tc1", role: "tool_call", toolCallId: "call-1", name: "search_content", content: '{"pattern":"foo"}', createdAt: "" },
    { id: "tr1", role: "tool", toolCallId: "call-1", name: "search_content", content: "found foo at line 5", createdAt: "" },
  ];

  const normalized = normalizeThreadMessages(messages);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].kind, "message");
  assert.equal(normalized[0].message.role, "user");
  assert.equal(normalized[1].kind, "tool");
  assert.equal(normalized[1].tool.toolCallId, "call-1");
  assert.equal(normalized[1].tool.name, "search_content");
  assert.equal(normalized[1].tool.result, "found foo at line 5");
});

test("normalizeThreadMessages keeps file parts on user messages", () => {
  const messages = [
    {
      id: "u1",
      role: "user",
      content: [
        { type: "text", text: "check this screenshot" },
        {
          type: "file",
          data: "ZmFrZS1pbWFnZQ==",
          mimeType: "image/png",
          filename: "screenshot.png",
        },
      ] as unknown,
      createdAt: "",
    } satisfies SessionMessage,
  ];

  const normalized = normalizeThreadMessages(messages);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].kind, "message");
  assert.equal(normalized[0].message.role, "user");
  assert.equal(normalized[0].message.content, "check this screenshot");
  assert.deepEqual(normalized[0].message.images, [
    {
      data: "ZmFrZS1pbWFnZQ==",
      mimeType: "image/png",
      filename: "screenshot.png",
    },
  ]);
});

test("normalizeThreadMessages keeps image-only user messages with file parts", () => {
  const messages = [
    {
      id: "u1",
      role: "user",
      content: [
        {
          type: "file",
          data: "ZmFrZS1pbWFnZQ==",
          mimeType: "image/png",
          filename: "screenshot.png",
        },
      ] as unknown,
      createdAt: "",
    } satisfies SessionMessage,
  ];

  const normalized = normalizeThreadMessages(messages);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].kind, "message");
  assert.equal(normalized[0].message.role, "user");
  assert.equal(normalized[0].message.content, "");
  assert.deepEqual(normalized[0].message.images, [
    {
      data: "ZmFrZS1pbWFnZQ==",
      mimeType: "image/png",
      filename: "screenshot.png",
    },
  ]);
});

test("normalizeThreadMessages keeps image file parts with mediaType", () => {
  const messages = [
    {
      id: "u1",
      role: "user",
      content: [
        { type: "text", text: "look at this" },
        {
          type: "file",
          data: "ZmFrZS1pbWFnZQ==",
          mediaType: "image/png",
          filename: "screenshot.png",
        },
      ] as unknown,
      createdAt: "",
    } satisfies SessionMessage,
  ];

  const normalized = normalizeThreadMessages(messages);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].kind, "message");
  assert.equal(normalized[0].message.role, "user");
  assert.equal(normalized[0].message.content, "look at this");
  assert.deepEqual(normalized[0].message.images, [
    {
      data: "ZmFrZS1pbWFnZQ==",
      mimeType: "image/png",
      filename: "screenshot.png",
    },
  ]);
});
