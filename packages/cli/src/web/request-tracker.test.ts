import assert from "node:assert/strict";
import test from "node:test";
import { RequestTracker } from "./request-tracker.js";

test("request tracker ignores stale results", () => {
  const tracker = new RequestTracker();
  assert.equal(tracker.resolve("stale", "value"), false);
});

test("request tracker rejects all pending requests after a runtime crash", async () => {
  const tracker = new RequestTracker();
  const first = tracker.add("req-1");
  const second = tracker.add("req-2");

  tracker.rejectAll(new Error("runtime crashed"));

  await assert.rejects(first, /runtime crashed/);
  await assert.rejects(second, /runtime crashed/);
});
