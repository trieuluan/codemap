import assert from "node:assert/strict";
import test from "node:test";
import type { HarnessMessage, HarnessThread } from "../../agent/runtime/events.js";
import { formatSessionLabel, mapHarnessMessagesToUI, sortThreads } from "./sessions.js";

function harnessMessage(overrides: Partial<HarnessMessage>): HarnessMessage {
  return {
    id: "msg-1",
    role: "user",
    content: [{ type: "text", text: "hello" }],
    createdAt: new Date("2026-01-01T12:34:56.000Z"),
    ...overrides,
  } as HarnessMessage;
}

function thread(overrides: Partial<HarnessThread>): HarnessThread {
  return {
    id: "t-abc12345-0000-0000-0000-000000000000",
    resourceId: "resource-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as HarnessThread;
}

test("mapHarnessMessagesToUI preserves Date createdAt timestamps", () => {
  const createdAt = new Date("2026-01-01T12:34:56.000Z");

  const [message] = mapHarnessMessagesToUI([
    harnessMessage({ createdAt }),
  ]);

  assert.equal(message?.timestamp, createdAt.getTime());
});

test("mapHarnessMessagesToUI preserves serialized createdAt timestamps", () => {
  const createdAt = "2026-01-01T12:34:56.000Z";

  const [message] = mapHarnessMessagesToUI([
    harnessMessage({ createdAt } as unknown as Partial<HarnessMessage>),
  ]);

  assert.equal(message?.timestamp, new Date(createdAt).getTime());
});

// ── sortThreads ────────────────────────────────────────────────────────────

test("sortThreads orders by updatedAt descending (most recent first)", () => {
  const t1 = thread({ id: "t-old", updatedAt: new Date("2026-01-01") });
  const t2 = thread({ id: "t-new", updatedAt: new Date("2026-06-01") });
  const t3 = thread({ id: "t-mid", updatedAt: new Date("2026-03-01") });

  const sorted = sortThreads([t1, t2, t3]);
  assert.deepEqual(sorted.map((t) => t.id), ["t-new", "t-mid", "t-old"]);
});

test("sortThreads does not mutate the input array", () => {
  const t1 = thread({ id: "t-a", updatedAt: new Date("2026-01-01") });
  const t2 = thread({ id: "t-b", updatedAt: new Date("2026-06-01") });
  const input = [t1, t2];

  sortThreads(input);
  assert.deepEqual(input.map((t) => t.id), ["t-a", "t-b"]);
});

// ── formatSessionLabel ─────────────────────────────────────────────────────

test("formatSessionLabel includes short id, title, and age", () => {
  const t = thread({
    id: "t-abc12345-0000-0000-0000-000000000000",
    title: "Fix login bug",
    updatedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
  });

  const label = formatSessionLabel(t, false);
  assert.ok(label.includes("t-abc123"), `should contain short id: ${label}`);
  assert.ok(label.includes("Fix login bug"), `should contain title: ${label}`);
  assert.ok(label.includes("5m"), `should contain age: ${label}`);
});

test("formatSessionLabel shows active marker for current thread", () => {
  const t = thread({ id: "t-abc12345-0000" });
  assert.ok(formatSessionLabel(t, true).includes("●"));
  assert.ok(!formatSessionLabel(t, false).includes("●"));
});

// ── session restore: tool_call + tool_result ───────────────────────────────

test("mapHarnessMessagesToUI restores tool_call with args summary", () => {
  const createdAt = new Date("2026-01-01T12:00:00.000Z");
  const harness: HarnessMessage[] = [
    harnessMessage({
      role: "assistant",
      content: [
        { type: "tool_call", id: "tc-1", name: "view", args: { path: "src/index.ts" } },
      ],
      createdAt,
    }),
  ];

  const [msg] = mapHarnessMessagesToUI(harness);
  assert.equal(msg?.role, "tool_call");
  assert.equal(msg?.name, "view");
  assert.equal(msg?.toolCallId, "tc-1");
  assert.equal(msg?.content, "src/index.ts");
});

test("mapHarnessMessagesToUI restores previewContent for write_file", () => {
  const harness: HarnessMessage[] = [
    harnessMessage({
      role: "assistant",
      content: [
        {
          type: "tool_call",
          id: "tc-wf",
          name: "write_file",
          args: { path: "src/foo.ts", content: "export const x = 1;\n" },
        },
      ],
      createdAt: new Date(),
    }),
  ];

  const [msg] = mapHarnessMessagesToUI(harness);
  assert.equal(msg?.role, "tool_call");
  assert.ok(msg?.previewContent, "write_file should have previewContent");
  assert.ok(msg.previewContent.includes("diff"), "previewContent should be a diff");
  assert.ok(msg.previewContent.includes("export const x = 1"), "previewContent should include file content");
});

test("mapHarnessMessagesToUI restores previewContent for string_replace_lsp", () => {
  const harness: HarnessMessage[] = [
    harnessMessage({
      role: "assistant",
      content: [
        {
          type: "tool_call",
          id: "tc-edit",
          name: "string_replace_lsp",
          args: { path: "src/foo.ts", old_string: "old", new_string: "new" },
        },
      ],
      createdAt: new Date(),
    }),
  ];

  const [msg] = mapHarnessMessagesToUI(harness);
  assert.equal(msg?.role, "tool_call");
  assert.ok(msg?.previewContent, "string_replace_lsp should have previewContent");
  assert.ok(msg.previewContent.includes("old"), "previewContent should include old text");
  assert.ok(msg.previewContent.includes("new"), "previewContent should include new text");
});

test("mapHarnessMessagesToUI restores tool_call with string args", () => {
  const harness: HarnessMessage[] = [
    harnessMessage({
      role: "assistant",
      content: [
        { type: "tool_call", id: "tc-2", name: "search_content", args: '{"pattern":"TODO"}' },
      ],
      createdAt: new Date(),
    }),
  ];

  const [msg] = mapHarnessMessagesToUI(harness);
  assert.equal(msg?.role, "tool_call");
  // pattern is a string, not array → summarizeToolArgs falls back to display name
  assert.equal(msg?.content, "Call search_content");
});

test("mapHarnessMessagesToUI falls back to display name when no args", () => {
  const harness: HarnessMessage[] = [
    harnessMessage({
      role: "assistant",
      content: [
        { type: "tool_call", id: "tc-3", name: "some_tool", args: undefined },
      ],
      createdAt: new Date(),
    }),
  ];

  const [msg] = mapHarnessMessagesToUI(harness);
  assert.equal(msg?.role, "tool_call");
  assert.equal(msg?.content, "some_tool");
});

test("mapHarnessMessagesToUI attaches tool_result to matching tool_call", () => {
  const ts = new Date("2026-01-01T12:00:00.000Z");
  const harness: HarnessMessage[] = [
    harnessMessage({
      role: "assistant",
      content: [
        { type: "tool_call", id: "tc-10", name: "view", args: { path: "src/foo.ts" } },
        { type: "tool_result", id: "tc-10", name: "view", result: "file content here", isError: false },
      ],
      createdAt: ts,
    }),
  ];

  const messages = mapHarnessMessagesToUI(harness);
  // Should have exactly one tool_call message (result merged into it)
  assert.equal(messages.length, 1);
  const toolCall = messages[0]!;
  assert.equal(toolCall.role, "tool_call");
  assert.equal(toolCall.toolCallId, "tc-10");
  assert.ok(toolCall.content.startsWith("src/foo.ts"), "content should start with args summary");
  assert.ok(toolCall.toolResults?.length, "should have toolResults");
  assert.equal(toolCall.toolResults![0]!.success, true);
  assert.ok(toolCall.expandedContent?.includes("file content here"), "expandedContent should contain result");
});

test("mapHarnessMessagesToUI marks failed tool_result with ✗", () => {
  const harness: HarnessMessage[] = [
    harnessMessage({
      role: "assistant",
      content: [
        { type: "tool_call", id: "tc-11", name: "execute_command", args: { command: "npm test" } },
        { type: "tool_result", id: "tc-11", name: "execute_command", result: "exit code 1", isError: true },
      ],
      createdAt: new Date(),
    }),
  ];

  const messages = mapHarnessMessagesToUI(harness);
  assert.equal(messages.length, 1);
  const toolCall = messages[0]!;
  assert.ok(toolCall.content.includes("✗"), "content should include ✗ marker");
  assert.equal(toolCall.toolResults![0]!.success, false);
  assert.ok(toolCall.expandedContent?.includes("[ERROR]"), "expandedContent should include [ERROR] prefix");
});
