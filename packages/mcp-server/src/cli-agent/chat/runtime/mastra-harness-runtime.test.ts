import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MASTRA_AGENT_TIMEOUT_MS,
  formatMastraTimeoutDuration,
  resolveMastraAgentTimeout,
} from "./mastra-harness-runtime.js";

test("uses 10 minute Mastra agent timeout by default", () => {
  assert.deepEqual(resolveMastraAgentTimeout({}), {
    timeoutMs: DEFAULT_MASTRA_AGENT_TIMEOUT_MS,
    timeoutSource: "default",
  });
});

test("uses CODEMAP_MASTRA_AGENT_TIMEOUT_MS when it is a positive integer", () => {
  assert.deepEqual(
    resolveMastraAgentTimeout({ CODEMAP_MASTRA_AGENT_TIMEOUT_MS: "300000" }),
    { timeoutMs: 300_000, timeoutSource: "env" },
  );
});

test("falls back to default timeout for invalid env values", () => {
  for (const value of ["abc", "0", "-1", "1.5"]) {
    assert.deepEqual(
      resolveMastraAgentTimeout({ CODEMAP_MASTRA_AGENT_TIMEOUT_MS: value }),
      {
        timeoutMs: DEFAULT_MASTRA_AGENT_TIMEOUT_MS,
        timeoutSource: "default",
      },
    );
  }
});

test("formats timeout durations for user-facing timeout messages", () => {
  assert.equal(formatMastraTimeoutDuration(600_000), "10 minutes");
  assert.equal(formatMastraTimeoutDuration(60_000), "1 minute");
  assert.equal(formatMastraTimeoutDuration(90_000), "90 seconds");
});
