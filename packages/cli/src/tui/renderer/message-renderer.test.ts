import assert from "node:assert/strict";
import test from "node:test";
import { messageLines } from "./message-renderer.js";
import { stripAnsi } from "../text/text.js";
import type { Message } from "../../chat/state/types.js";


test("messageLines shows repeated timestamps only once per adjacent block", () => {
  const timestamp = new Date("2026-01-01T12:34:56.000Z").getTime();
  const messages: Message[] = [
    { role: "assistant", content: "first", timestamp },
    { role: "assistant", content: "second", timestamp: timestamp + 200 },
    { role: "assistant", content: "third", timestamp: timestamp + 1000 },
  ];

  const rendered = messageLines(messages, 100).map(stripAnsi).join("\n");
  const timestamps = rendered.match(/\b\d{2}:\d{2}:\d{2}\b/g) ?? [];

  assert.equal(timestamps.length, 2);
  assert.notEqual(timestamps[0], timestamps[1]);
});

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
  assert.match(rendered, /const ok = false;/);
  assert.match(rendered, /const ok = true;/);
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

  const rawRendered = messageLines(messages, width);
  const rendered = rawRendered.map(stripAnsi);

  assert.ok(rendered.length > 0);
  assert.match(rawRendered.join("\n"), /\x1b\[48;2;/);
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
  assert.match(rendered, /before/);
  assert.match(rendered, /after/);
  assert.match(rendered, /Replaced 1 occurrence in README\.md/);
});

test("messageLines keeps diff formatting when context contains markdown fences", () => {
  const messages: Message[] = [
    {
      role: "tool_call",
      name: "string_replace_lsp",
      content: "README.md",
      previewContent: [
        "~~~diff",
        "@@ -1,5 +1,5 @@ README.md",
        " ```md",
        " unchanged",
        " ```",
        "-old",
        "+new",
        "~~~",
      ].join("\n"),
      timestamp: 0,
    },
  ];

  const rendered = messageLines(messages, 100).map(stripAnsi).join("\n");

  assert.doesNotMatch(rendered, /```diff/);
  assert.match(rendered, /@@ -1,5 \+1,5 @@ README\.md/);
  assert.match(rendered, /^\s+```md$/m);
  assert.match(rendered, /^\s+unchanged$/m);
  assert.match(rendered, /^\s+```$/m);
  assert.match(rendered, /^\s+- old$/m);
  assert.match(rendered, /^\s+\+ new$/m);
});

test("messageLines keeps non-diff previews rendered as markdown", () => {
  const messages: Message[] = [
    {
      role: "tool_call",
      name: "codemap_diff",
      content: "Call codemap_diff",
      previewContent: [
        "```json",
        "{",
        '  "mode": "working"',
        "}",
        "```",
      ].join("\n"),
      timestamp: 0,
    },
  ];

  const rendered = messageLines(messages, 100).map(stripAnsi).join("\n");

  assert.match(rendered, /----------------------------------------/);
  assert.match(rendered, /\{/);
  assert.match(rendered, /"mode": "working"/);
  assert.doesNotMatch(rendered, /```diff/);
});

test("messageLines renders markdown list items as context lines in unified diff format", () => {
  // Unified diff format: context lines have a leading space, add lines start with +, remove lines start with -
  // buildToolPreview/formatPatch always produces correct unified diff with space-prefixed context lines.
  // This test verifies the renderer preserves that — " - Codex" (context) vs "- Codex" (removal).
  const messages: Message[] = [
    {
      role: "tool_call",
      name: "string_replace_lsp",
      content: "README.md",
      previewContent: [
        "~~~diff",
        "@@ -10,8 +10,8 @@ README.md",
        " ## Targets",
        " - Codex",
        " - Claude",
        " - Cursor",
        "+- Gemini",
        " OpenCode",
        " Copilot",
        "~~~",
      ].join("\n"),
      timestamp: 0,
    },
  ];

  const rendered = messageLines(messages, 120).map(stripAnsi).join("\n");

  assert.match(rendered, /^\s+## Targets$/m);
  assert.match(rendered, /^\s+- Codex$/m);
  assert.match(rendered, /^\s+- Claude$/m);
  assert.match(rendered, /^\s+- Cursor$/m);
  assert.match(rendered, /^\s+\+ - Gemini$/m);
  assert.match(rendered, /^\s+OpenCode$/m);
  assert.match(rendered, /^\s+Copilot$/m);
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
