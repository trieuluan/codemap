import assert from "node:assert/strict";
import test from "node:test";
import type { HarnessMessage, HarnessThread } from "../harness/events.js";
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
