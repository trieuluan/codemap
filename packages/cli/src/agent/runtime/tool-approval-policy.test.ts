import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMastraPermissionRules,
  buildToolPreview,
  parseLineRangesFromResult,
  rebuildEditPreviewWithLineRanges,
} from "./config/tool-approval-policy.js";

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
  assert.equal(rules.tools.codemap_reimport, "ask");
  assert.equal(rules.tools.github_apply_patch, "ask");
});

test("buildToolPreview renders apply_patch as diff", () => {
  const preview = buildToolPreview("apply_patch", {
    patch: "*** Begin Patch\n*** Update File: a.ts\n@@\n-old\n+new\n*** End Patch",
  });

  assert.match(preview, /^~~~diff\n/);
  assert.match(preview, /\+new/);
});

test("buildToolPreview falls back to compact JSON", () => {
  const preview = buildToolPreview("unknown_tool", { path: "a.ts" });

  assert.match(preview, /^~~~json\n/);
  assert.match(preview, /"path": "a\.ts"/);
});

test("buildToolPreview returns compact summary for task_write", () => {
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

  assert.equal(preview, "3 tasks: ✓ 1, ▸ 1, ○ 1");
});

test("buildToolPreview returns empty notice for task_write with empty tasks", () => {
  const preview = buildToolPreview("task_write", { tasks: [] });

  assert.equal(preview, "(empty task list)");
});

test("buildToolPreview returns compact summary for task_update", () => {
  const preview = buildToolPreview("task_update", {
    id: "explore",
    content: "Explore repo",
    activeForm: "Exploring repo",
    status: "in_progress",
  });

  assert.equal(preview, "#explore · → in_progress · Explore repo");
});

test("buildToolPreview returns empty notice for task_write with no tasks field", () => {
  const preview = buildToolPreview("task_write", { foo: "bar" });

  assert.equal(preview, "(empty task list)");
});

test("buildToolPreview shows raw command for execute_command", () => {
  const preview = buildToolPreview("execute_command", {
    command: "npm run build",
  });

  assert.equal(preview, "$ npm run build");
});

test("buildToolPreview shows subagent type and truncated task", () => {
  const longTask = "A".repeat(200);
  const preview = buildToolPreview("subagent", {
    agentType: "explore",
    task: longTask,
  });

  assert.match(preview, /^explore · A{117}\.\.\.$/);
});

test("parseLineRangesFromResult parses single line", () => {
  const result = parseLineRangesFromResult(
    "Replaced 1 occurrence in src/foo.ts (lines 47)",
  );
  assert.deepEqual(result, [47, 47]);
});

test("parseLineRangesFromResult parses line range", () => {
  const result = parseLineRangesFromResult(
    "Replaced 1 occurrence in src/foo.ts (lines 47-49)",
  );
  assert.deepEqual(result, [47, 49]);
});

test("parseLineRangesFromResult parses multiple ranges", () => {
  const result = parseLineRangesFromResult(
    "Replaced 2 occurrences in src/foo.ts (lines 10, 47-49)",
  );
  assert.deepEqual(result, [10, 10]);
});

test("parseLineRangesFromResult returns null for no line info", () => {
  const result = parseLineRangesFromResult(
    "Cannot edit binary files. Use the write file tool instead.",
  );
  assert.equal(result, null);
});

test("rebuildEditPreviewWithLineRanges returns null for non-edit tools", () => {
  const result = rebuildEditPreviewWithLineRanges(
    "execute_command",
    { command: "ls" },
    "output",
  );
  assert.equal(result, null);
});

test("rebuildEditPreviewWithLineRanges returns null when no line ranges in result", () => {
  const result = rebuildEditPreviewWithLineRanges(
    "string_replace_lsp",
    { path: "src/foo.ts", old_string: "a", new_string: "b" },
    "Error: string not found",
  );
  assert.equal(result, null);
});
