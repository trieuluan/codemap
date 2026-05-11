import type terminalKit from "terminal-kit";
type Terminal = typeof terminalKit.terminal;
import type { Message, UIState } from "../store.js";
import { truncate, wrapText, stripAnsi } from "./helpers.js";

/**
 * Render all chat messages. Returns total line count rendered.
 */
export function renderMessages(term: Terminal, state: UIState): number {
  const width = state.viewport.width;
  let lineCount = 0;

  for (const msg of state.messages) {
    lineCount += renderMessage(term, msg, width);
  }

  return lineCount;
}

function renderMessage(term: Terminal, msg: Message, width: number): number {
  switch (msg.role) {
    case "welcome":
      return 0; // handled by header block
    case "user":
      return renderUserMessage(term, msg.content, width);
    case "assistant":
      return renderAssistantMessage(term, msg.content, width);
    case "tool":
      return renderToolMessage(term, msg, width);
    case "system":
      return renderSystemMessage(term, msg.content);
  }
}

function renderUserMessage(term: Terminal, content: string, width: number): number {
  const maxW = Math.min(width - 4, 76);
  const innerW = maxW - 2;
  const sp = "  ";
  const hLine = "─".repeat(innerW);

  term("\n");
  term(sp);
  term.dim.gray("┌─┤ ");
  term.bold.green("You");
  term.dim.gray(" ├" + hLine.slice(5) + "┐");
  term("\n");

  const wrapped = wrapText(content, innerW - 2, "  ");
  for (const line of wrapped.split("\n")) {
    term(sp);
    term.dim.gray("│ ");
    term.white(line);
    const padR = innerW - 2 - line.length;
    if (padR > 0) term(" ".repeat(padR));
    term.dim.gray("│");
    term("\n");
  }

  term(sp);
  term.dim.gray("└" + hLine + "┘");
  term("\n");
  return 4 + wrapped.split("\n").length;
}

function renderAssistantMessage(term: Terminal, content: string, width: number): number {
  const maxW = Math.min(width - 4, 76);
  const innerW = maxW - 2;
  const sp = "  ";
  const hLine = "─".repeat(innerW);

  term("\n");
  term(sp);
  term.dim.gray("┌─┤ ");
  term.bold.cyan("CodeMap");
  term.dim.gray(" ├" + hLine.slice(9) + "┐");
  term("\n");

  const wrapped = wrapText(content, innerW - 2, "  ");
  for (const line of wrapped.split("\n")) {
    term(sp);
    term.dim.gray("│ ");
    term(line);
    const lineLen = stripAnsi(line).length;
    const padR = innerW - 2 - lineLen;
    if (padR > 0) term(" ".repeat(padR));
    term.dim.gray("│");
    term("\n");
  }

  term(sp);
  term.dim.gray("└" + hLine + "┘");
  term("\n");
  return 4 + wrapped.split("\n").length;
}

function renderToolMessage(term: Terminal, msg: Message, width: number): number {
  const maxW = Math.min(width - 4, 76);
  const innerW = maxW - 2;
  const sp = "  ";

  // Tool result — compact inline
  if (msg.toolName?.endsWith(" result")) {
    const resultText = truncate(msg.content, 200);
    term("\n");
    term(sp);
    term.dim.gray("↳ ");
    term.dim.gray(`${msg.toolName}: `);
    term.dim.gray(resultText);
    term("\n");
    return 2;
  }

  // Tool call — bordered block with yellow accent
  const hLine = "─".repeat(innerW);
  const toolLabel = msg.toolName || "tool";
  const labelPart = `─┤ `;
  const afterLabel = ` ├`;
  const remaining = innerW - labelPart.length - afterLabel.length - toolLabel.length;
  const rightPad = "─".repeat(Math.max(0, remaining));

  term("\n");
  term(sp);
  term.dim.yellow("┌" + labelPart);
  term.yellow.bold(toolLabel);
  term.dim.yellow(afterLabel + rightPad + "┐");
  term("\n");

  const content = truncate(msg.content, 200);
  const wrapped = wrapText(content, innerW - 4, "  ");
  for (const line of wrapped.split("\n")) {
    term(sp);
    term.dim.yellow("│ ");
    term.dim.gray(line);
    const lineLen = line.length;
    const padR = innerW - 2 - lineLen;
    if (padR > 0) term(" ".repeat(padR));
    term.dim.yellow("│");
    term("\n");
  }

  term(sp);
  term.dim.yellow("└" + hLine + "┘");
  term("\n");
  return 4 + wrapped.split("\n").length;
}

function renderSystemMessage(term: Terminal, content: string): number {
  const lower = content.toLowerCase();

  term("\n  ");
  if (lower.startsWith("error") || lower.startsWith("blocked:")) {
    term("│ ");
    term.bold.red(content);
  } else if (lower.startsWith("warning") || lower.startsWith("⚠")) {
    term("│ ");
    term.yellow(content);
  } else if (
    lower.startsWith("switched") ||
    lower.startsWith("connected") ||
    lower.startsWith("done")
  ) {
    term("│ ");
    term.green(content);
  } else {
    term("│ ");
    term.dim.gray(content);
  }
  term("\n");
  return 2;
}
