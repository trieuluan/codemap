import assert from "node:assert/strict";
import test from "node:test";

import type { SessionSnapshot } from "@codemap-ai/core/agent/contracts";

import {
  estimateAttribution,
  estimateCurrentContext,
  estimateRawThreadAttribution,
} from "./TokenObservabilityPanel.js";

function createSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    threadId: "thread-1",
    messages: [],
    status: "idle",
    streamingText: "",
    thinkingText: "",
    tools: [],
    pendingApproval: null,
    pendingQuestion: null,
    pendingPlanReview: null,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    threadUsage: null,
    model: "gpt-5",
    error: null,
    ...overrides,
  };
}

test("estimateCurrentContext uses promptTokens when available", () => {
  const snapshot = createSnapshot({
    usage: {
      promptTokens: 50_000,
      completionTokens: 10_000,
      totalTokens: 60_000,
    },
    messages: [
      { id: "m1", role: "system", content: "system instructions" },
      { id: "m2", role: "assistant", content: "previous answer" },
      { id: "m3", role: "tool_call", toolCallId: "tool-1", name: "read_file", content: "src/app.ts" },
      { id: "m4", role: "tool", toolCallId: "tool-1", name: "read_file", content: "file contents here" },
    ],
  });

  const estimate = estimateCurrentContext(snapshot);
  // Should use promptTokens (50K), not totalTokens (60K)
  assert.equal(estimate.total, 50_000);
  assert.equal(estimate.categories.reduce((sum, c) => sum + c.tokens, 0), 50_000);
  assert.deepEqual(estimateAttribution(snapshot), estimate.categories);
});

test("estimateCurrentContext falls back to BPE when no real usage", () => {
  const snapshot = createSnapshot({
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    messages: [
      { id: "m1", role: "user", content: "hello world" },
      { id: "m2", role: "assistant", content: "hi there" },
    ],
  });

  const estimate = estimateCurrentContext(snapshot);
  // Should fall back to BPE estimate, not 0
  assert.ok(estimate.total > 0, "should have BPE fallback total");
  assert.equal(estimate.categories.reduce((sum, c) => sum + c.tokens, 0), estimate.total);
});

test("estimateRawThreadAttribution uses threadUsage.totalTokens when available", () => {
  const THREAD_TOTAL = 62_400_000;
  const snapshot = createSnapshot({
    usage: { promptTokens: 50_000, completionTokens: 10_000, totalTokens: 60_000 },
    threadUsage: { promptTokens: 0, completionTokens: 0, totalTokens: THREAD_TOTAL },
    messages: [
      { id: "m1", role: "assistant", content: "some history" },
      { id: "m2", role: "tool_call", toolCallId: "t1", name: "read_file", content: "src/big.ts" },
      { id: "m3", role: "tool", toolCallId: "t1", name: "read_file", content: "long output here" },
    ],
  });

  const raw = estimateRawThreadAttribution(snapshot);

  // Should use the real thread total, not BPE
  assert.equal(raw.total, THREAD_TOTAL);
  assert.equal(raw.categories.reduce((sum, c) => sum + c.tokens, 0), THREAD_TOTAL);
  // Raw total should be much larger than current context estimate
  const current = estimateCurrentContext(snapshot);
  assert.ok(raw.total > current.total);
});

test("estimateRawThreadAttribution falls back to BPE when no threadUsage", () => {
  const snapshot = createSnapshot({
    usage: { promptTokens: 50_000, completionTokens: 10_000, totalTokens: 60_000 },
    threadUsage: null,
    messages: [
      { id: "m1", role: "assistant", content: "history ".repeat(500) },
      { id: "m2", role: "tool_call", toolCallId: "t1", name: "read_file", content: "src/big.ts" },
      { id: "m3", role: "tool", toolCallId: "t1", name: "read_file", content: "big file output ".repeat(500) },
    ],
  });

  const raw = estimateRawThreadAttribution(snapshot);
  assert.ok(raw.total > 0, "should fall back to BPE estimate");
  assert.equal(raw.categories.reduce((sum, c) => sum + c.tokens, 0), raw.total);
});

test("systemPrompt populates System bucket", () => {
  const snapshot = createSnapshot({
    systemPrompt: "You are a helpful assistant. Follow these rules carefully.",
    usage: { promptTokens: 10_000, completionTokens: 2_000, totalTokens: 12_000 },
    messages: [
      { id: "m1", role: "user", content: "hello" },
      { id: "m2", role: "assistant", content: "hi" },
    ],
  });

  const estimate = estimateCurrentContext(snapshot);
  const systemCategory = estimate.categories.find((c) => c.key === "system");
  assert.ok(systemCategory && systemCategory.tokens > 0, "System bucket should be non-zero when systemPrompt is set");
});

test("categories sum equals total for both estimates", () => {
  const snapshot = createSnapshot({
    usage: { promptTokens: 80_000, completionTokens: 20_000, totalTokens: 100_000 },
    threadUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 5_000_000 },
    messages: [
      { id: "m1", role: "system", content: "system prompt" },
      { id: "m2", role: "user", content: "user message" },
      { id: "m3", role: "assistant", content: "assistant reply" },
    ],
  });

  const current = estimateCurrentContext(snapshot);
  const raw = estimateRawThreadAttribution(snapshot);

  assert.equal(current.categories.reduce((sum, c) => sum + c.tokens, 0), current.total);
  assert.equal(raw.categories.reduce((sum, c) => sum + c.tokens, 0), raw.total);
  assert.equal(current.total, 80_000); // uses promptTokens
  assert.equal(raw.total, 5_000_000);  // uses threadUsage.totalTokens
});
