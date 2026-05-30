import assert from "node:assert/strict";
import test from "node:test";
import { messageLines } from "./message-renderer.js";
import { stripAnsi } from "./text.js";
import type { Message } from "../store.js";

test("messageLines renders fenced diff previews inline", () => {
  const messages: Message[] = [
    {
      role: "tool_call",
      name: "edit_file",
      content: "src/app.ts",
      previewContent: [
        "File: src/app.ts",
        "",
        "~~~diff",
        "--- old",
        "+++ new",
        "-const ok = false;",
        "+const ok = true;",
        "~~~",
      ].join("\n"),
      timestamp: 0,
    },
  ];

  const rendered = messageLines(messages, 100).map(stripAnsi).join("\n");

  assert.match(rendered, /⎿  \+1 -1 lines/);
  assert.match(rendered, /-const ok = false;/);
  assert.match(rendered, /\+const ok = true;/);
});

test("messageLines clamps diff preview lines to terminal width", () => {
  const width = 64;
  const messages: Message[] = [
    {
      role: "tool_call",
      name: "edit_file",
      content: "Call codemap · edit_file",
      previewContent: [
        "~~~diff",
        "diff --git a//tmp/codemap-edit-file-mcp-test.txt b//tmp/codemap-edit-file-mcp-test.txt",
        "--- a//tmp/codemap-edit-file-mcp-test.txt",
        "+++ b//tmp/codemap-edit-file-mcp-test.txt",
        "@@ -1,1 +1,1 @@ /tmp/codemap-edit-file-mcp-test.txt",
        "-before with a long tail that should not overflow the terminal width",
        "+after with a long tail that should not overflow the terminal width",
        "~~~",
      ].join("\n"),
      timestamp: 0,
    },
  ];

  const rendered = messageLines(messages, width).map(stripAnsi);

  assert.ok(rendered.length > 0);
  for (const line of rendered) {
    assert.ok(
      line.length <= width,
      `expected line width <= ${width}, got ${line.length}: ${line}`,
    );
  }
});

test("messageLines renders tool result only in expanded block", () => {
  const messages: Message[] = [
    {
      role: "tool_call",
      name: "edit_file",
      content: "Call edit_file",
      toolResults: [
        {
          name: "edit_file",
          content: "Edit Applied\nFile: /tmp/a\nReplacements: 1",
          success: true,
        },
      ],
      timestamp: 0,
    },
  ];

  const collapsed = messageLines(messages, 100).map(stripAnsi).join("\n");
  assert.doesNotMatch(collapsed, /Edit Applied/);
  assert.doesNotMatch(collapsed, /Replacements: 1/);

  const expanded = messageLines([
    {
      ...messages[0]!,
      expanded: true,
      expandedContent: "Edit Applied\nFile: /tmp/a\nReplacements: 1",
    },
  ], 100)
    .map(stripAnsi)
    .join("\n");
  assert.match(expanded, /Edit Applied/);
  assert.match(expanded, /Replacements: 1/);
  assert.equal(expanded.match(/Edit Applied/g)?.length, 1);
});

test("messageLines keeps passive preview visible when expanded", () => {
  const messages: Message[] = [
    {
      role: "tool_call",
      name: "string_replace_lsp",
      content: "README.md",
      previewContent: [
        "~~~diff",
        "@@ -1,1 +1,1 @@ README.md",
        "-before",
        "+after",
        "~~~",
      ].join("\n"),
      expanded: true,
      expandedContent: "Replaced 1 occurrence in README.md",
      toolResults: [
        {
          name: "string_replace_lsp",
          content: "Replaced 1 occurrence in README.md",
          success: true,
        },
      ],
      timestamp: 0,
    },
  ];

  const rendered = messageLines(messages, 100).map(stripAnsi).join("\n");

  assert.match(rendered, /⎿  \+1 -1 lines/);
  assert.match(rendered, /-before/);
  assert.match(rendered, /\+after/);
  assert.match(rendered, /Replaced 1 occurrence in README\.md/);
});

test("expanded CodeMap tool results show summary without raw data by default", () => {
  const expandedContent = JSON.stringify({
    content: [{ type: "text", text: "Project ready" }],
    structuredContent: {
      summary: "Project ready",
      data: {
        projectId: "abc",
        secretDetail: "raw-json-only",
      },
    },
  });

  const rendered = messageLines([
    {
      role: "tool_call",
      name: "get_project",
      content: "get_project ✓",
      expanded: true,
      expandedContent,
      toolResults: [{ name: "get_project", content: "Project ready", success: true }],
      timestamp: 0,
    },
  ], 100)
    .map(stripAnsi)
    .join("\n");

  assert.match(rendered, /Project ready/);
  assert.doesNotMatch(rendered, /Raw data/);
  assert.doesNotMatch(rendered, /raw-json-only/);
});

test("expanded CodeMap tool results show raw data in debug mode", () => {
  const expandedContent = JSON.stringify({
    structuredContent: {
      summary: "Project ready",
      data: {
        projectId: "abc",
        secretDetail: "raw-json-only",
      },
    },
  });

  const rendered = messageLines([
    {
      role: "tool_call",
      name: "get_project",
      content: "get_project ✓",
      expanded: true,
      expandedContent,
      toolResults: [{ name: "get_project", content: "Project ready", success: true }],
      timestamp: 0,
    },
  ], 100, 0, { showRawToolData: true })
    .map(stripAnsi)
    .join("\n");

  assert.match(rendered, /Project ready/);
  assert.match(rendered, /Raw data/);
  assert.match(rendered, /raw-json-only/);
});

test("expanded CodeMap tool results show raw data for verbose responses", () => {
  const expandedContent = JSON.stringify({
    summary: "Verbose result",
    data: {
      meta: { verbosity: "verbose" },
      detail: "visible-when-verbose",
    },
  });

  const rendered = messageLines([
    {
      role: "tool_call",
      name: "search_codebase",
      content: "search_codebase ✓",
      expanded: true,
      expandedContent,
      toolResults: [{ name: "search_codebase", content: "Verbose result", success: true }],
      timestamp: 0,
    },
  ], 100)
    .map(stripAnsi)
    .join("\n");

  assert.match(rendered, /Verbose result/);
  assert.match(rendered, /Raw data/);
  assert.match(rendered, /visible-when-verbose/);
});
