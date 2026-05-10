import { useState, useEffect, useRef, useMemo } from "react";
import { Box, Text, useInput, useStdin, useApp } from "ink";
import { searchIndexedFiles, type IndexedFileOption } from "./file-search.js";

interface MentionInputProps {
  onSubmit: (text: string) => void;
  busy: boolean;
  prompt?: string;
}

const MAX_SUGGESTIONS = 6;

export function MentionInput({ onSubmit, busy, prompt = "codemap> " }: MentionInputProps) {
  const [buffer, setBuffer] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<IndexedFileOption[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [ghostText, setGhostText] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setRawMode } = useStdin();
  const { exit } = useApp();

  // Enable raw mode for Ink's useInput to work
  useEffect(() => {
    setRawMode?.(true);
    return () => {
      setRawMode?.(false);
    };
  }, [setRawMode]);

  // Extract the @mention being typed
  const currentMention = useMemo(() => {
    const beforeCursor = buffer.slice(0, cursorPos);
    const match = beforeCursor.match(/@([^\s@]*)$/);
    return match ? match[1] : null;
  }, [buffer, cursorPos]);

  // Trigger search when mention query changes
  useEffect(() => {
    if (currentMention === null) {
      setMentionQuery(null);
      setSuggestions([]);
      setGhostText("");
      setSelectedIdx(0);
      return;
    }

    setMentionQuery(currentMention);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchIndexedFiles(currentMention);
        const filtered = results.filter((f) => isSelectablePath(f.path)).slice(0, MAX_SUGGESTIONS);
        setSuggestions(filtered);
        setSelectedIdx(0);

        // Ghost text = top suggestion minus what's already typed
        if (filtered.length > 0) {
          const topPath = filtered[0].path;
          const remaining = topPath.slice(currentMention.length);
          setGhostText(remaining);
        } else {
          setGhostText("");
        }
      } catch {
        setSuggestions([]);
        setGhostText("");
      }
    }, 150);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [currentMention]);

  useInput((input, key) => {
    if (busy) return;

    // Ctrl+C
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    // Tab — accept ghost text / top suggestion
    if (key.tab && ghostText && suggestions.length > 0) {
      const selected = suggestions[selectedIdx];
      if (selected) {
        const beforeCursor = buffer.slice(0, cursorPos);
        const mentionStart = beforeCursor.lastIndexOf("@");
        const afterCursor = buffer.slice(cursorPos);
        const newBuffer = `${beforeCursor.slice(0, mentionStart)}@${selected.path} ${afterCursor}`;
        setBuffer(newBuffer);
        setCursorPos(mentionStart + selected.path.length + 1);
      }
      setSuggestions([]);
      setGhostText("");
      return;
    }

    // Arrow down — next suggestion
    if (key.downArrow && suggestions.length > 0) {
      setSelectedIdx((prev) => (prev + 1) % suggestions.length);
      const next = suggestions[(selectedIdx + 1) % suggestions.length];
      if (next) setGhostText(next.path.slice((currentMention ?? "").length));
      return;
    }

    // Arrow up — prev suggestion
    if (key.upArrow && suggestions.length > 0) {
      setSelectedIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      const prev = suggestions[(selectedIdx - 1 + suggestions.length) % suggestions.length];
      if (prev) setGhostText(prev.path.slice((currentMention ?? "").length));
      return;
    }

    // Escape — dismiss suggestions
    if (key.escape) {
      setSuggestions([]);
      setGhostText("");
      setMentionQuery(null);
      return;
    }

    // Enter — submit
    if (key.return) {
      if (suggestions.length > 0 && mentionQuery !== null) {
        // Accept selected suggestion first
        const selected = suggestions[selectedIdx];
        if (selected) {
          const beforeCursor = buffer.slice(0, cursorPos);
          const mentionStart = beforeCursor.lastIndexOf("@");
          const afterCursor = buffer.slice(cursorPos);
          const newBuffer = `${beforeCursor.slice(0, mentionStart)}@${selected.path} ${afterCursor}`;
          setBuffer(newBuffer);
          setCursorPos(mentionStart + selected.path.length + 1);
          setSuggestions([]);
          setGhostText("");
          return;
        }
      }

      const trimmed = buffer.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setBuffer("");
        setCursorPos(0);
      }
      setSuggestions([]);
      setGhostText("");
      return;
    }

    // Backspace
    if (key.backspace || key.delete) {
      if (cursorPos > 0) {
        setBuffer((prev) => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos));
        setCursorPos((prev) => prev - 1);
      }
      return;
    }

    // Left arrow
    if (key.leftArrow) {
      setCursorPos((prev) => Math.max(0, prev - 1));
      return;
    }

    // Right arrow
    if (key.rightArrow) {
      setCursorPos((prev) => Math.min(buffer.length, prev + 1));
      return;
    }

    // Home
    if (key.home) {
      setCursorPos(0);
      return;
    }

    // End
    if (key.end) {
      setCursorPos(buffer.length);
      return;
    }

    // Printable character
    if (input && !key.ctrl && !key.meta) {
      setBuffer((prev) => prev.slice(0, cursorPos) + input + prev.slice(cursorPos));
      setCursorPos((prev) => prev + input.length);
    }
  });

  // Render the input line
  const beforeCursor = buffer.slice(0, cursorPos);
  const afterCursor = buffer.slice(cursorPos);

  // Split into text before @mention, mention part, and text after
  let beforeMention = beforeCursor;
  let mentionText = "";
  let ghostPart = ghostText;

  if (mentionQuery !== null) {
    const mentionStart = beforeCursor.lastIndexOf("@");
    beforeMention = beforeCursor.slice(0, mentionStart);
    mentionText = beforeCursor.slice(mentionStart);
  }

  return (
    <Box flexDirection="column">
      {/* Suggestions dropdown */}
      {suggestions.length > 0 && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={0}>
          {suggestions.map((s, i) => (
            <Box key={s.path}>
              <Text
                color={i === selectedIdx ? "cyan" : "gray"}
                bold={i === selectedIdx}
                inverse={i === selectedIdx}
              >
                {i === selectedIdx ? " ▸ " : "   "}
                {s.path}
              </Text>
              {s.hint && (
                <Text color="gray"> {s.hint}</Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Input line */}
      <Box>
        <Text color="cyan" bold>{prompt}</Text>
        <Text>{beforeMention}</Text>
        {mentionQuery !== null && (
          <>
            <Text color="yellow">{mentionText}</Text>
            <Text color="gray" dimColor>{ghostPart}</Text>
          </>
        )}
        <Text inverse>{"█"}</Text>
        <Text>{afterCursor}</Text>
      </Box>
    </Box>
  );
}

function isSelectablePath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ds_store")) return false;
  if (lower.includes("/node_modules/") || lower.includes("/.git/")) return false;
  if (lower.includes("/dist/") || lower.includes("/build/") || lower.includes("/coverage/")) return false;
  return true;
}
