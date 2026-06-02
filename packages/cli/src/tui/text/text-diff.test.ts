import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdownish, stripAnsi, truncateVisible, wrapPlain } from "./text.js";
import { visibleWidth } from "@earendil-works/pi-tui";

const ANSI_FG = "\x1b[38;2;255;0;0m";
const RESET = "\x1b[0m";

describe("truncateVisible", () => {
  it("plain string — no ANSI", () => {
    const t = truncateVisible("hello world", 5);
    assert.ok(stripAnsi(t).length <= 6, `expected <= 6 chars, got: ${JSON.stringify(t)}`);
  });

  it("ANSI string truncated safely — no leaked escape", () => {
    const s = `${ANSI_FG}hello world this is long${RESET}`;
    const t = truncateVisible(s, 5);
    const stripped = stripAnsi(t);
    // Stripped text should have no leftover ESC bytes
    assert.ok(!stripped.includes("\x1b"), `leaked ESC in stripped output: ${JSON.stringify(stripped)}`);
  });

  it("ANSI string that fits is returned as-is", () => {
    const s = `${ANSI_FG}hi${RESET}`;
    assert.equal(truncateVisible(s, 20), s);
  });

  it("ANSI string — visible width of result within budget", () => {
    const s = `${ANSI_FG}hello world this is intentionally long${RESET}`;
    const t = truncateVisible(s, 10);
    assert.ok(visibleWidth(t) <= 11, `visibleWidth ${visibleWidth(t)} > 11`);
  });
});

describe("wrapPlain", () => {
  it("wraps ANSI-colored text without leaking escape bytes or exceeding width", () => {
    const s = `${ANSI_FG}hello world this is intentionally long${RESET}`;
    const lines = wrapPlain(s, 10);
    for (const line of lines) {
      assert.ok(visibleWidth(line) <= 10, `visibleWidth ${visibleWidth(line)} > 10`);
      assert.ok(!stripAnsi(line).includes("\x1b"), `leaked ESC: ${JSON.stringify(stripAnsi(line))}`);
    }
  });

  it("skips non-color CSI sequences when wrapping", () => {
    const s = `hello\x1b[?25l world this is intentionally long`;
    const lines = wrapPlain(s, 12);
    for (const line of lines) {
      assert.ok(visibleWidth(stripAnsi(line)) <= 12, `visibleWidth ${visibleWidth(stripAnsi(line))} > 12`);
      assert.ok(!stripAnsi(line).includes("\x1b"), `leaked ESC: ${JSON.stringify(stripAnsi(line))}`);
    }
  });
});

describe("renderMarkdownish diff — .go preview lines within width", () => {
  const diff = `\`\`\`diff
diff --git a/main.go b/main.go
--- a/main.go
+++ b/main.go
@@ -1,4 +1,4 @@ main.go
-package main
+package main
 
-func main() { fmt.Println("old value that is intentionally long enough to test wrapping behavior in preview") }
+func main() { fmt.Println("new value that is intentionally long enough to test wrapping behavior in preview") }
\`\`\``;

  for (const width of [40, 60, 80]) {
    it(`width=${width}: no visible line exceeds width`, () => {
      const lines = renderMarkdownish(diff, width, { noHighlight: true });
      for (const line of lines) {
        const vw = visibleWidth(line);
        assert.ok(vw <= width, `line exceeds width=${width} (vw=${vw}): ${JSON.stringify(stripAnsi(line))}`);
      }
    });

    it(`width=${width}: no leaked ESC in stripped lines`, () => {
      const lines = renderMarkdownish(diff, width, { noHighlight: true });
      for (const line of lines) {
        const stripped = stripAnsi(line);
        assert.ok(!stripped.includes("\x1b"), `leaked ESC: ${JSON.stringify(stripped)}`);
      }
    });
  }
});
