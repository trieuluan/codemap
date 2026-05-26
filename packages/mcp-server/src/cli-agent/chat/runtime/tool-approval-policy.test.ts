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
  assert.equal(rules.tools.codemap_rename_symbol, "ask");
  assert.equal(rules.tools.codemap_move_symbols, "ask");
  assert.equal(rules.tools.codemap_trigger_reimport, "ask");
  assert.equal(rules.tools.github_apply_patch, "ask");
});

test("isMutatingApprovalTool recognizes known mutating approval tools", () => {
  assert.equal(isMutatingApprovalTool("write_file"), true);
  assert.equal(isMutatingApprovalTool("codemap_apply_patch"), true);
  assert.equal(isMutatingApprovalTool("codemap_rename_symbol"), true);
  assert.equal(isMutatingApprovalTool("codemap_trigger_reimport"), true);
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

test("buildToolPreview renders write_file content as unified diff", () => {
  const preview = buildToolPreview("write_file", {
    path: "src/app.ts",
    content: "export const ok = true;\n",
  });

  assert.match(preview, /^~~~diff\n/);
  assert.match(preview, /diff --git a\/src\/app\.ts b\/src\/app\.ts/);
  assert.match(preview, /@@ -0,0 \+1,1 @@ src\/app\.ts/);
  assert.match(preview, /\+export const ok = true;/);
});

test("buildToolPreview renders edit old and new text as unified diff", () => {
  const preview = buildToolPreview("string_replace_lsp", {
    filePath: "src/app.ts",
    oldString: "const ok = false;",
    newString: "const ok = true;",
  });

  assert.match(preview, /diff --git a\/src\/app\.ts b\/src\/app\.ts/);
  assert.match(preview, /@@ -1,1 \+1,1 @@ src\/app\.ts/);
  assert.match(preview, /-const ok = false;/);
  assert.match(preview, /\+const ok = true;/);
});

test("buildToolPreview falls back to compact JSON", () => {
  const preview = buildToolPreview("unknown_tool", { path: "a.ts" });

  assert.match(preview, /^~~~json\n/);
  assert.match(preview, /"path": "a\.ts"/);
});

test("buildToolPreview renders task_write tasks as a markdown checklist", () => {
  const preview = buildToolPreview("task_write", {
    tasks: [
      {
        id: "explore",
        content: "Explore repo",
        activeForm: "Exploring repo",
        status: "completed",
      },
      {
        id: "implement",
        content: "Implement feature",
        activeForm: "Implementing feature",
        status: "in_progress",
      },
      {
        id: "verify",
        content: "Verify build",
        activeForm: "Verifying build",
        status: "pending",
      },
    ],
  });

  assert.match(preview, /\*\*Task list \(3\)\*\*/);
  assert.match(preview, /- \[x\] ~~Explore repo~~/);
  assert.match(preview, /- \[~\] Implementing feature _\(in progress\)_/);
  assert.match(preview, /- \[ \] Verify build/);
});

test("buildToolPreview renders task_write with empty tasks as placeholder", () => {
  const preview = buildToolPreview("task_write", { tasks: [] });

  assert.equal(preview, "_(empty task list)_");
});

test("buildToolPreview renders task_update single task as one-line checklist", () => {
  const preview = buildToolPreview("task_update", {
    id: "explore",
    content: "Explore repo",
    activeForm: "Exploring repo",
    status: "in_progress",
  });

  assert.match(preview, /\*\*Task list \(1\)\*\*/);
  assert.match(preview, /- \[~\] Exploring repo _\(in progress\)_/);
});

test("buildToolPreview falls back to JSON when task_write has no tasks field", () => {
  const preview = buildToolPreview("task_write", { foo: "bar" });

  assert.match(preview, /^~~~json\n/);
  assert.match(preview, /"foo": "bar"/);
});
