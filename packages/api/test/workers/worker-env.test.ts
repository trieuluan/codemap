import * as assert from "node:assert";
import { test } from "node:test";
import { readPositiveIntegerEnv } from "../../src/workers/worker-env";

test("readPositiveIntegerEnv returns the default when env is missing", () => {
  assert.equal(readPositiveIntegerEnv("WORKER_CONCURRENCY", 2, {}), 2);
});

test("readPositiveIntegerEnv parses positive integer env values", () => {
  assert.equal(
    readPositiveIntegerEnv("WORKER_CONCURRENCY", 2, {
      WORKER_CONCURRENCY: "5",
    }),
    5,
  );
});

test("readPositiveIntegerEnv falls back for invalid values", () => {
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    assert.equal(
      readPositiveIntegerEnv("WORKER_CONCURRENCY", 2, {
        WORKER_CONCURRENCY: "0",
      }),
      2,
    );
    assert.equal(
      readPositiveIntegerEnv("WORKER_CONCURRENCY", 2, {
        WORKER_CONCURRENCY: "nope",
      }),
      2,
    );
  } finally {
    console.warn = originalWarn;
  }
});
