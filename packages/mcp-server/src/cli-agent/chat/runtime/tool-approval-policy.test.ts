import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMastraPermissionRules,
  buildToolPreview,
  isMutatingApprovalTool,
} from "./tool-approval-policy.js";

test("buildMastraPermissionRules asks for mutating tools without asking for all MCP tools", () => {
  const rules = buildMastraPermissionRules(["codemap", "github"]);

  assert.equal(rules.categories.read, "allow");
  assert.equal(rules.categories.edit, "ask");
  assert.equal(rules.categories.execute, "ask");
  assert.equal(rules.categories.mcp, "allow");
  assert.equal(rules.tools.write_file, "ask");
  assert.equal(rules.tools.string_replace_lsp, "ask");
  assert.equal(rules.tools.codemap_write_file, "ask");
  assert.equal(rules.tools.github_apply_patch, "ask");
});

test("isMutatingApprovalTool recognizes known mutating approval tools", () => {
  assert.equal(isMutatingApprovalTool("write_file"), true);
  assert.equal(isMutatingApprovalTool("codemap_apply_patch"), true);
  assert.equal(isMutatingApprovalTool("search_content"), false);
  assert.equal(isMutatingApprovalTool("codemap_get_file"), false);
});

test("buildToolPreview renders apply_patch as diff", () => {
  const preview = buildToolPreview("apply_patch", {
    patch: "*** Begin Patch\n*** Update File: a.ts\n@@\n-old\n+new\n*** End Patch",
  });

  assert.match(preview, /^~~~diff\n/);
  assert.match(preview, /\+new/);
});

test("buildToolPreview renders write_file content with file language", () => {
  const preview = buildToolPreview("write_file", {
    path: "src/app.ts",
    content: "export const ok = true;\n",
  });

  assert.match(preview, /File: src\/app\.ts/);
  assert.match(preview, /~~~typescript\nexport const ok = true;/);
});

test("buildToolPreview renders edit old and new text as mini diff", () => {
  const preview = buildToolPreview("string_replace_lsp", {
    filePath: "src/app.ts",
    oldString: "const ok = false;",
    newString: "const ok = true;",
  });

  assert.match(preview, /File: src\/app\.ts/);
  assert.match(preview, /--- old/);
  assert.match(preview, /-const ok = false;/);
  assert.match(preview, /\+const ok = true;/);
});

test("buildToolPreview falls back to compact JSON", () => {
  const preview = buildToolPreview("unknown_tool", { path: "a.ts" });

  assert.match(preview, /^~~~json\n/);
  assert.match(preview, /"path": "a\.ts"/);
});
