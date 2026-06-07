import assert from "node:assert/strict";
import test from "node:test";
import { isMastraThreadAlreadyActive } from "./threads.js";

test("returns true when switching to the already active thread", () => {
  assert.equal(isMastraThreadAlreadyActive("thread-1", "thread-1"), true);
});

test("returns false when switching to a different thread", () => {
  assert.equal(isMastraThreadAlreadyActive("thread-1", "thread-2"), false);
});

test("returns false when there is no active thread yet", () => {
  assert.equal(isMastraThreadAlreadyActive(null, "thread-1"), false);
});
