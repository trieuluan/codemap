import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SQLiteIndexStore } from "./sqlite-index-store.js";

test("SQLiteIndexStore persists and queries symbol_calls and symbol_relationships", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "codemap-sqlite-"));
  const dbPath = path.join(dir, "index.db");
  const store = SQLiteIndexStore.open(dbPath);

  try {
    store.write(
      [
        {
          path: "src/trait.rs",
          dirPath: "src",
          baseName: "trait.rs",
          extension: "rs",
          language: "Rust",
          mimeType: "text/plain",
          sizeBytes: 50,
          lineCount: 3,
          parseStatus: "parsed",
          isBinary: false,
          isText: true,
          contentSha256: "a",
          content: "pub trait Runner {\n  fn run(&self);\n}\n",
          symbols: [
            {
              localKey: "src/trait.rs#trait:Runner",
              stableKey: "src/trait.rs#trait:Runner:1",
              displayName: "Runner",
              kind: "trait",
              language: "Rust",
              signature: "pub trait Runner {",
              returnType: null,
              doc: null,
              isExported: true,
              isDefaultExport: false,
              line: 1,
              col: 0,
              endLine: 3,
              endCol: 1,
            },
          ],
          imports: [],
          importedBy: [
            {
              sourceFilePath: "src/impl.rs",
              moduleSpecifier: "crate::trait::Runner",
              importKind: "use",
              resolutionKind: "relative_path",
              startLine: 1,
              startCol: 0,
              endLine: 1,
              endCol: 20,
            },
          ],
          exports: [],
          calls: [],
          relationships: [],
        },
        {
          path: "src/impl.rs",
          dirPath: "src",
          baseName: "impl.rs",
          extension: "rs",
          language: "Rust",
          mimeType: "text/plain",
          sizeBytes: 80,
          lineCount: 4,
          parseStatus: "parsed",
          isBinary: false,
          isText: true,
          contentSha256: "b",
          content: "use crate::trait::Runner;\nstruct App;\nimpl Runner for App {}\nfn main() { boot(); }\n",
          symbols: [],
          imports: [
            {
              localKey: "src/impl.rs#use:crate::trait::Runner:1:0",
              moduleSpecifier: "crate::trait::Runner",
              importKind: "use",
              isTypeOnly: false,
              importedNames: ["Runner"],
              line: 1,
              col: 0,
              endLine: 1,
              endCol: 25,
              resolutionKind: "relative_path",
              targetPathText: "src/trait.rs",
              targetExternalSymbolKey: null,
            },
          ],
          importedBy: [],
          exports: [],
          calls: [{ calleeName: "boot", line: 4, col: 12, endCol: 16 }],
          relationships: [
            {
              fromSymbolLocalKey: "src/impl.rs#class:App",
              toSymbolName: "Runner",
              relationshipKind: "implements",
            },
          ],
        },
      ],
      {
        indexedAt: new Date().toISOString(),
        commitSha: "abc",
        workspaceRootPath: dir,
        cachePath: dbPath,
        parserName: "codemap",
        parserVersion: "3.3.1",
      },
    );

    const callers = store.findSymbolCallers("boot");
    assert.equal(callers.length, 1);
    assert.equal(callers[0]?.filePath, "src/impl.rs");
    assert.equal(callers[0]?.line, 4);
    assert.ok(callers[0]?.preview?.includes("boot()"));

    const rels = store.findSymbolRelationships("Runner");
    assert.equal(rels.children.length, 1);
    assert.equal(rels.children[0]?.fromSymbolLocalKey, "src/impl.rs#class:App");
    assert.equal(rels.children[0]?.relationshipKind, "implements");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
