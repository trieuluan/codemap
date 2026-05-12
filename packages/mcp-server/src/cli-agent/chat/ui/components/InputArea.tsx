import { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { UIState } from "../store.js";
import type { ChatTerminal } from "../chat-terminal.js";

interface Props {
  state: UIState;
  chatTerminal: ChatTerminal;
}

export function InputArea({ state, chatTerminal }: Props) {
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const history = state.input.history;
  const [historyIdx, setHistoryIdx] = useState(-1);

  const charLen = (s: string) => [...s].length;

  useInput((input, key) => {
    // ── Confirm dialog ─────────────────────────────────
    if (state.confirm.active) {
      if (input === "y") chatTerminal.resolveConfirm(true);
      else if (input === "a") chatTerminal.resolveConfirmAll();
      else if (input === "n" || key.escape) chatTerminal.resolveConfirm(false);
      return;
    }

    // ── Scroll messages (keyboard) ──────────────────────
    if (key.pageUp || (key.ctrl && key.upArrow)) {
      const st = chatTerminal.store.getState();
      chatTerminal.store.dispatch({ messageScroll: { offset: st.messageScroll.offset + 8, autoScroll: false } });
      return;
    }
    if (key.pageDown || (key.ctrl && key.downArrow)) {
      const st = chatTerminal.store.getState();
      const newOffset = Math.max(0, st.messageScroll.offset - 8);
      chatTerminal.store.dispatch({ messageScroll: { offset: newOffset, autoScroll: newOffset === 0 } });
      return;
    }

    // ── Submit ─────────────────────────────────────────
    if (key.return) {
      const trimmed = text.trim();
      setText(""); setCursor(0); setHistoryIdx(-1);
      if (trimmed) {
        chatTerminal.store.dispatch((prev) => ({
          input: { ...prev.input, history: [...prev.input.history, trimmed] },
        }));
        chatTerminal.handleSubmit(trimmed);
      }
      return;
    }

    if (key.ctrl && input === "c") { process.exit(0); }
    if (key.ctrl && input === "d" && text.length === 0) { process.exit(0); }

    // ── Edit ───────────────────────────────────────────
    if (key.backspace || key.delete) {
      if (cursor > 0) {
        const arr = [...text]; arr.splice(cursor - 1, 1);
        setText(arr.join("")); setCursor((c) => c - 1);
      }
      return;
    }

    if (key.leftArrow)  { if (cursor > 0) setCursor((c) => c - 1); return; }
    if (key.rightArrow) { if (cursor < charLen(text)) setCursor((c) => c + 1); return; }

    if (key.upArrow) {
      if (history.length > 0) {
        const idx = Math.min(historyIdx + 1, history.length - 1);
        setHistoryIdx(idx);
        const entry = history[history.length - 1 - idx] ?? "";
        setText(entry); setCursor(charLen(entry));
      }
      return;
    }
    if (key.downArrow) {
      if (historyIdx > 0) {
        const idx = historyIdx - 1;
        setHistoryIdx(idx);
        const entry = history[history.length - 1 - idx] ?? "";
        setText(entry); setCursor(charLen(entry));
      } else {
        setHistoryIdx(-1); setText(""); setCursor(0);
      }
      return;
    }

    if (key.ctrl && input === "a") { setCursor(0); return; }
    if (key.ctrl && input === "e") { setCursor(charLen(text)); return; }
    if (key.ctrl && input === "k") { setText([...text].slice(0, cursor).join("")); return; }
    if (key.ctrl && input === "u") { setText([...text].slice(cursor).join("")); setCursor(0); return; }

    // ── Printable (includes Vietnamese/Unicode) ─────────
    if (input && !key.ctrl && !key.meta) {
      const arr = [...text];
      for (const ch of input) {
        const cp = ch.codePointAt(0) ?? 0;
        if (cp >= 0x20 && cp !== 0x7f) {
          arr.splice(cursor, 0, ch);
          setCursor((c) => c + 1);
        }
      }
      setText(arr.join(""));
    }
  });

  const chars = [...text];
  const before = chars.slice(0, cursor).join("");
  const atCursor = chars[cursor] ?? " ";
  const after = chars.slice(cursor + 1).join("");
  const showPlaceholder = text.length === 0;

  return (
    <Box flexDirection="column">
      {/* Subprocess log */}
      {state.subprocess.active && (
        <Box borderStyle="round" borderColor="yellow" flexDirection="column">
          <Text color="yellow">{` ${state.subprocess.command}`}</Text>
          {state.subprocess.logLines.slice(-8).map((line, i) => (
            <Text key={i} dimColor>{`  ${line.slice(0, 80)}`}</Text>
          ))}
        </Box>
      )}

      {/* Confirm dialog */}
      {state.confirm.active && (
        <Box borderStyle="round" borderColor="yellow" flexDirection="column">
          <Text color="yellow">{` ${state.confirm.toolName}`}</Text>
          <Text color="white">{"  wants to edit files"}</Text>
          {state.confirm.preview &&
            state.confirm.preview.split("\n").slice(0, 8).map((line, i) => {
              const color = line.startsWith("+") ? "green" : line.startsWith("-") ? "red" : undefined;
              return <Text key={i} color={color} dimColor={!color}>{`  ${line.slice(0, 70)}`}</Text>;
            })}
          <Text color="green">{"  [y]es  [n]o  [a]ll (accept all)"}</Text>
        </Box>
      )}

      {/* Input box */}
      <Box borderStyle="round" borderColor="#374151">
        <Text color="cyan" bold>{" > "}</Text>
        {showPlaceholder ? (
          <Text dimColor>{"Ask anything or type / for commands..."}</Text>
        ) : (
          <>
            <Text>{before}</Text>
            <Text inverse>{atCursor}</Text>
            <Text>{after}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
