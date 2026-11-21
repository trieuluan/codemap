import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SQLiteIndexStore } from "./sqlite-index-store.js";

test("SQLiteIndexStore builds vector summaries and ranks cosine similarity", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "codemap-vec-"));
  const dbPath = path.join(dir, "index.db");
  const store = SQLiteIndexStore.open(dbPath);

  try {
    store.write(
      [
        {
          path: "src/retry.ts",
          dirPath: "src",
          baseName: "retry.ts",
          extension: "ts",
          language: "TypeScript",
          mimeType: "text/plain",
          sizeBytes: 30,
          lineCount: 2,
          parseStatus: "parsed",
          isBinary: false,
          isText: true,
          contentSha256: "h1",
          content: "export function backoff() {}\n",
          symbols: [
            {
              localKey: "src/retry.ts#function:backoff",
              stableKey: "src/retry.ts#function:backoff:1",
              displayName: "backoff",
              kind: "function",
              language: "TypeScript",
              signature: "export function backoff()",
              returnType: null,
              doc: null,
              isExported: true,
              isDefaultExport: false,
              line: 1,
              col: 0,
              endLine: 1,
              endCol: 25,
            },
          ],
          imports: [],
          importedBy: [],
          exports: [],
          calls: [],
          relationships: [],
        },
        {
          path: "src/ui.ts",
          dirPath: "src",
          baseName: "ui.ts",
          extension: "ts",
          language: "TypeScript",
          mimeType: "text/plain",
          sizeBytes: 30,
          lineCount: 2,
          parseStatus: "parsed",
          isBinary: false,
          isText: true,
          contentSha256: "h2",
          content: "export function renderButton() {}\n",
          symbols: [],
          imports: [],
          importedBy: [],
          exports: [],
          calls: [],
          relationships: [],
        },
      ],
      {
        indexedAt: new Date().toISOString(),
        commitSha: "abc",
        workspaceRootPath: dir,
        cachePath: dbPath,
        parserName: "codemap",
        parserVersion: "3.3.2",
      },
    );

    const summaries = store.getFileVectorSummaries();
    assert.equal(summaries.length, 2);
    assert.ok(summaries[0]?.summaryText.includes("backoff"));

    store.upsertFileVectors([
      {
        filePath: "src/retry.ts",
        textSha256: summaries[0]!.textSha256,
        vector: new Float32Array([0.9, 0.1, 0.0]),
      },
      {
        filePath: "src/ui.ts",
        textSha256: summaries[1]!.textSha256,
        vector: new Float32Array([0.1, 0.9, 0.0]),
      },
    ]);

    const hits = store.searchSemantic(new Float32Array([1.0, 0.0, 0.0]), 5);
    assert.equal(hits[0]?.path, "src/retry.ts");
    assert.ok((hits[0]?.score ?? 0) > 0.9);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
