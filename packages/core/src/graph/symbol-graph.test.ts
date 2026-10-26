import assert from "node:assert/strict";
import test from "node:test";
import { buildSymbolGraph, type LocalGraphSymbol } from "./symbol-graph.ts";

const sym = (filePath: string, name: string, kind: string, extra: Partial<LocalGraphSymbol> = {}): LocalGraphSymbol => ({
  filePath, localKey: `${filePath}#${kind}:${name}`, displayName: name, kind, parentLocalKey: null, isExported: true, line: 1, signature: null, ...extra,
});
const edge = (source: string, target: string) => ({ sourceFileId: source, targetFileId: target, importKind: "import", isResolved: true, resolutionKind: "relative" });

test("drops symbols of minified files and of files outside the graph", () => {
  const minified = Array.from({ length: 12 }, (_, i) => sym("dist/worker.js", i < 6 ? `a${i}` : `readableName${i}`, "function"));
  const { symbols } = buildSymbolGraph([...minified, sym("src/a.ts", "run", "function"), sym("gone.ts", "x1", "function")], new Set(["dist/worker.js", "src/a.ts"]), []);
  assert.deepEqual(symbols.map(symbol => symbol.id), ["sym:src/a.ts#function:run"]);
});

test("defines edges start at the parent symbol when present, otherwise at the file", () => {
  const cls = sym("src/a.ts", "Store", "class");
  const method = sym("src/a.ts", "get", "method", { parentLocalKey: cls.localKey });
  const { symbolEdges } = buildSymbolGraph([cls, method], new Set(["src/a.ts"]), []);
  assert.deepEqual(symbolEdges.map(e => [e.source, e.target, e.kind]), [
    ["src/a.ts", `sym:${cls.localKey}`, "defines"],
    [`sym:${cls.localKey}`, `sym:${method.localKey}`, "defines"],
  ]);
});

test("extends resolves via imported files when the name is ambiguous, and skips unresolvable bases", () => {
  const baseA = sym("src/base-a.ts", "Base", "class");
  const baseB = sym("src/base-b.ts", "Base", "class");
  const child = sym("src/child.ts", "Child", "class", { signature: "export class Child extends Base implements Missing {" });
  const external = sym("src/err.ts", "HttpError", "class", { signature: "class HttpError extends Error {" });
  const { symbolEdges } = buildSymbolGraph([baseA, baseB, child, external], new Set(["src/base-a.ts", "src/base-b.ts", "src/child.ts", "src/err.ts"]), [edge("src/child.ts", "src/base-b.ts")]);
  assert.deepEqual(symbolEdges.filter(e => e.kind !== "defines").map(e => [e.source, e.target, e.kind]), [
    [`sym:${child.localKey}`, `sym:${baseB.localKey}`, "extends"],
  ]);
});
