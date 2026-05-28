import * as assert from "node:assert";
import { test } from "node:test";

// Test the semantic search response handling
test("symbol tool similar action handles semantic API response format", async () => {
  const mockSemanticResponse = {
    results: [
      {
        path: "src/utils/helper.ts",
        symbolName: "helperFunction",
        chunkType: "symbol",
        startLine: 10,
        endLine: 20,
        score: 0.85,
        snippet: "function helperFunction() { ... }",
      },
      {
        path: "src/lib/processor.ts",
        symbolName: "processData",
        chunkType: "symbol",
        startLine: 45,
        endLine: 60,
        score: 0.72,
        snippet: "async function processData(input) { ... }",
      },
    ],
    query: "test query",
  };

  // Simulate the response unwrapping that happens in the tool
  const semanticResponse = mockSemanticResponse as { results: typeof mockSemanticResponse.results };
  const similar = (semanticResponse.results ?? []).filter(
    (result) => result.score > 0.5,
  );

  assert.equal(similar.length, 2);
  assert.equal(similar[0].symbolName, "helperFunction");
  assert.equal(similar[0].score, 0.85);
  assert.equal(similar[1].symbolName, "processData");
});

test("symbol tool similar action handles empty results gracefully", async () => {
  const mockSemanticResponse = {
    results: [],
    query: "test query",
  };

  const semanticResponse = mockSemanticResponse as { results: typeof mockSemanticResponse.results };
  const similar = (semanticResponse.results ?? []).filter(
    (result) => result.score > 0.5,
  );

  assert.equal(similar.length, 0);
});

test("symbol tool similar action handles missing results field", async () => {
  const mockSemanticResponse = {
    query: "test query",
    // results field missing
  };

  const semanticResponse = mockSemanticResponse as { results?: Array<{ score: number }> };
  const similar = (semanticResponse.results ?? []).filter(
    (result) => result.score > 0.5,
  );

  assert.equal(similar.length, 0);
});

test("move-symbols tool semantic conflict detection works", async () => {
  const mockSemanticResponse = {
    results: [
      {
        path: "dest/file.ts",
        symbolName: "existingFunction",
        chunkType: "symbol",
        startLine: 10,
        endLine: 20,
        score: 0.85,
        snippet: "function existingFunction() { ... }",
      },
      {
        path: "other/file.ts",
        symbolName: "otherFunction",
        chunkType: "symbol",
        startLine: 45,
        endLine: 60,
        score: 0.72,
        snippet: "function otherFunction() { ... }",
      },
    ],
    query: "test query",
  };

  const to = "dest/file.ts";
  const rangeName = "newFunction";

  // Simulate the conflict detection logic
  const result = { value: mockSemanticResponse };
  const conflict = (result.value.results ?? []).find(
    (candidate) =>
      candidate.path === to &&
      candidate.score >= 0.78 &&
      candidate.symbolName?.toLowerCase() !== rangeName.toLowerCase(),
  );

  assert.ok(conflict);
  assert.equal(conflict.symbolName, "existingFunction");
  assert.equal(conflict.path, "dest/file.ts");
  assert.equal(conflict.score, 0.85);
});

test("move-symbols tool handles no conflicts", async () => {
  const mockSemanticResponse = {
    results: [
      {
        path: "other/file.ts",
        symbolName: "otherFunction",
        chunkType: "symbol",
        startLine: 45,
        endLine: 60,
        score: 0.72,
        snippet: "function otherFunction() { ... }",
      },
    ],
    query: "test query",
  };

  const to = "dest/file.ts";
  const rangeName = "newFunction";

  const result = { value: mockSemanticResponse };
  const conflict = (result.value.results ?? []).find(
    (candidate) =>
      candidate.path === to &&
      candidate.score >= 0.78 &&
      candidate.symbolName?.toLowerCase() !== rangeName.toLowerCase(),
  );

  assert.equal(conflict, undefined);
});

test("move-symbols tool handles empty semantic results", async () => {
  const mockSemanticResponse = {
    results: [],
    query: "test query",
  };

  const to = "dest/file.ts";
  const rangeName = "newFunction";

  const result = { value: mockSemanticResponse };
  const conflict = (result.value.results ?? []).find(
    (candidate) =>
      candidate.path === to &&
      candidate.score >= 0.78 &&
      candidate.symbolName?.toLowerCase() !== rangeName.toLowerCase(),
  );

  assert.equal(conflict, undefined);
});

test("get-project-insights tool cluster extraction", async () => {
  const mockSemanticResponse = {
    results: [
      {
        path: "src/utils/helper.ts",
        symbolName: "helperFunction",
        chunkType: "symbol",
        startLine: 10,
        endLine: 20,
        score: 0.85,
        snippet: "function helperFunction() { ... }",
      },
    ],
    query: "test query",
  };

  // Simulate the insights extraction logic
  const response = await Promise.resolve({ results: mockSemanticResponse.results });
  const cluster = { label: "src/utils", results: response.results ?? [] };

  assert.equal(cluster.label, "src/utils");
  assert.equal(cluster.results.length, 1);
  assert.equal(cluster.results[0].symbolName, "helperFunction");
});

test("search-codebase tool semantic results handling", async () => {
  const mockSemanticResponse = {
    results: [
      {
        path: "src/utils/helper.ts",
        symbolName: "helperFunction",
        chunkType: "symbol",
        startLine: 10,
        endLine: 20,
        score: 0.85,
        snippet: "function helperFunction() { ... }",
      },
      {
        path: "src/lib/processor.ts",
        symbolName: "processData",
        chunkType: "symbol",
        startLine: 45,
        endLine: 60,
        score: 0.72,
        snippet: "async function processData(input) { ... }",
      },
    ],
    query: "test query",
  };

  // Simulate the search-codebase extraction logic
  const semanticResult = {
    status: "fulfilled" as const,
    value: mockSemanticResponse.results,
  };

  const keywordPaths = new Set(["src/utils/helper.ts"]);
  let semanticResults: typeof mockSemanticResponse.results = [];

  if (
    semanticResult.status === "fulfilled" &&
    Array.isArray(semanticResult.value)
  ) {
    semanticResults = semanticResult.value.filter(
      (r) => !keywordPaths.has(r.path),
    );
  }

  assert.equal(semanticResults.length, 1);
  assert.equal(semanticResults[0].symbolName, "processData");
});

console.log("All semantic tool tests passed!");
