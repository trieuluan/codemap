import assert from "node:assert/strict";
import test from "node:test";
import type { HarnessMessage } from "../harness/events.js";
import { mapHarnessMessagesToUI } from "./sessions.js";

function harnessMessage(overrides: Partial<HarnessMessage>): HarnessMessage {
  return {
    id: "msg-1",
    role: "user",
    content: [{ type: "text", text: "hello" }],
    createdAt: new Date("2026-01-01T12:34:56.000Z"),
    ...overrides,
  } as HarnessMessage;
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
