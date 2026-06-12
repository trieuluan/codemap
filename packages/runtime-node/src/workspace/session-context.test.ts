import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadExtraConventions } from "./session-context.js";

test("workspace context preserves conventions and dedicated rule content", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codemap-runtime-"));
  try {
    await mkdir(path.join(root, ".cursor", "rules"), { recursive: true });
    await writeFile(path.join(root, ".cursorrules"), "general cursor");
    await writeFile(
      path.join(root, ".cursor", "rules", "typescript.mdc"),
      "typescript rules",
    );

    const context = await loadExtraConventions(root);

    assert.match(context.conventions ?? "", /general cursor/);
    assert.match(context.conventions ?? "", /typescript rules/);
    assert.match(context.rules ?? "", /typescript rules/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
