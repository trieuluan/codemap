import assert from "node:assert/strict";
import test from "node:test";
import { messageLines } from "./message-renderer.js";
import { stripAnsi } from "./text.js";
import type { Message } from "../store.js";

test("messageLines renders fenced diff previews inline", () => {
  const messages: Message[] = [
    {
      role: "tool_call",
      name: "edit_file",
      content: "src/app.ts",
      previewContent: [
        "File: src/app.ts",
        "",
        "~~~diff",
        "--- old",
        "+++ new",
        "-const ok = false;",
        "+const ok = true;",
        "~~~",
      ].join("\n"),
      timestamp: 0,
    },
  ];

  const rendered = messageLines(messages, 100).map(stripAnsi).join("\n");

  assert.match(rendered, /⎿  \+1 -1 lines/);
  assert.match(rendered, /-const ok = false;/);
  assert.match(rendered, /\+const ok = true;/);
});
