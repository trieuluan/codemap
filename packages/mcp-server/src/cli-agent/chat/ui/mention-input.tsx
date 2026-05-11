import { useState, useEffect, useRef, useMemo } from "react";
import { Box, Text, useInput, useStdin, useApp } from "ink";
import { Select } from "@inkjs/ui";
import { searchIndexedFiles, type IndexedFileOption } from "../file-search.js";

interface MentionInputProps {
  onSubmit: (text: string) => void;
  onAbort?: () => void;
  busy: boolean;
  prompt?: string;
  inputHistory?: string[];
}

const MAX_SUGGESTIONS = 6;

export function MentionInput({
  onSubmit,
  onAbort,
  busy,
  prompt = "> ",
  inputHistory = [],
}: MentionInputProps) {
  const [buffer, setBuffer] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<IndexedFileOption[]>([]);
  const [ghostText, setGhostText] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [savedBuffer, setSavedBuffer] = useState("");
  const suppressRef = useRef(false);
  const { setRawMode } = useStdin();
  const { exit } = useApp();

  const dropdownOpen = suggestions.length > 0;

  useEffect(() => {
    setRawMode?.(true);
    return () => setRawMode?.(false);
  }, [setRawMode]);

  useEffect(() => {
    setHistoryIdx(-1);
  }, [inputHistory.length]);

  const currentMention = useMemo(() => {
    const beforeCursor = buffer.slice(0, cursorPos);
    const match = beforeCursor.match(/@([^\s@]*)$/);
    return match ? match[1] : null;
  }, [buffer, cursorPos]);

  useEffect(() => {
    if (suppressRef.current) {
      suppressRef.current = false;
      return;
    }

    if (currentMention === null) {
      setMentionQuery(null);
      setSuggestions([]);
      setGhostText("");
      return;
    }

    setMentionQuery(currentMention);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchIndexedFiles(currentMention);
        const filtered = results
          .filter((f) => isSelectablePath(f.path))
          .slice(0, MAX_SUGGESTIONS);
        setSuggestions(filtered);

        if (filtered.length > 0) {
          const topPath = filtered[0].path;
          setGhostText(topPath.slice(currentMention.length));
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

  const acceptSuggestion = (filePath: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    suppressRef.current = true;
    const beforeCursor = buffer.slice(0, cursorPos);
    const mentionStart = beforeCursor.lastIndexOf("@");
    if (mentionStart === -1) return;
    const afterCursor = buffer.slice(cursorPos);
    const newBuffer = `${beforeCursor.slice(0, mentionStart)}@${filePath} ${afterCursor}`;
    setBuffer(newBuffer);
    setCursorPos(mentionStart + filePath.length + 2);
    setSuggestions([]);
    setGhostText("");
    setMentionQuery(null);
  };

  const dismissSuggestions = () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    suppressRef.current = true;
    setSuggestions([]);
    setGhostText("");
    setMentionQuery(null);
  };

  const handleSelectChange = (value: string) => {
    acceptSuggestion(value);
  };

  // Unified input handler — Ctrl+C works even when busy
  useInput(
    (input, key) => {
      // Ctrl+C: Claude-style behavior
      // 1. If busy (task running) → abort task
      // 2. If not busy and buffer has text → clear buffer
      // 3. If not busy and buffer empty → exit session
      if (key.ctrl && input === "c") {
        if (busy) {
          onAbort?.();
          return;
        }
        if (buffer.length > 0) {
          setBuffer("");
          setCursorPos(0);
          setHistoryIdx(-1);
          dismissSuggestions();
          return;
        }
        exit();
        return;
      }

      if (busy) return;

      // When dropdown is open, Escape dismisses it, Tab/Enter accepts first suggestion
      if (dropdownOpen) {
        if (key.escape) {
          dismissSuggestions();
          return;
        }
        if (key.tab && ghostText) {
          acceptSuggestion(suggestions[0].path);
          return;
        }
        // Arrow keys and Enter are handled by Select — let them pass through
        if (key.upArrow || key.downArrow || key.return) {
          return;
        }
      }

      // Tab to accept ghost text (when no dropdown)
      if (key.tab && ghostText && suggestions.length > 0) {
        acceptSuggestion(suggestions[0].path);
        return;
      }

      if (key.escape) {
        if (historyIdx !== -1) {
          setHistoryIdx(-1);
          setBuffer(savedBuffer);
          setCursorPos(savedBuffer.length);
        }
        return;
      }

      if (key.downArrow) {
        if (inputHistory.length > 0) {
          if (historyIdx === -1) return;
          const nextIdx = historyIdx + 1;
          if (nextIdx >= inputHistory.length) {
            setHistoryIdx(-1);
            setBuffer(savedBuffer);
            setCursorPos(savedBuffer.length);
          } else {
            setHistoryIdx(nextIdx);
            setBuffer(inputHistory[nextIdx]);
            setCursorPos(inputHistory[nextIdx].length);
          }
        }
        return;
      }

      if (key.upArrow) {
        if (inputHistory.length > 0) {
          if (historyIdx === -1) {
            setSavedBuffer(buffer);
          }
          const newIdx =
            historyIdx === -1
              ? inputHistory.length - 1
              : Math.max(0, historyIdx - 1);
          setHistoryIdx(newIdx);
          setBuffer(inputHistory[newIdx]);
          setCursorPos(inputHistory[newIdx].length);
        }
        return;
      }

      if (key.return) {
        const trimmed = buffer.trim();
        if (trimmed) {
          onSubmit(trimmed);
          setBuffer("");
          setCursorPos(0);
          setHistoryIdx(-1);
        }
        setSuggestions([]);
        setGhostText("");
        return;
      }

      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          setBuffer(
            (prev) => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos),
          );
          setCursorPos((prev) => prev - 1);
        }
        return;
      }

      if (key.leftArrow) {
        setCursorPos((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.rightArrow) {
        setCursorPos((prev) => Math.min(buffer.length, prev + 1));
        return;
      }

      if (key.home) {
        setCursorPos(0);
        return;
      }

      if (key.end) {
        setCursorPos(buffer.length);
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        if (historyIdx !== -1) {
          setHistoryIdx(-1);
        }
        setBuffer(
          (prev) => prev.slice(0, cursorPos) + input + prev.slice(cursorPos),
        );
        setCursorPos((prev) => prev + input.length);
      }
    },
    { isActive: !busy },
  );

  // Render the input line
  const beforeCursor = buffer.slice(0, cursorPos);
  const afterCursor = buffer.slice(cursorPos);

  let beforeMention = beforeCursor;
  let mentionText = "";
  let ghostPart = ghostText;

  if (mentionQuery !== null) {
    const mentionStart = beforeCursor.lastIndexOf("@");
    beforeMention = beforeCursor.slice(0, mentionStart);
    mentionText = beforeCursor.slice(mentionStart);
  }

  const selectOptions = useMemo(
    () =>
      suggestions.map((s) => ({
        label: s.hint ? `${s.path}  ${s.hint}` : s.path,
        value: s.path,
      })),
    [suggestions],
  );

  return (
    <Box flexDirection="column">
      {/* Select dropdown */}
      {dropdownOpen && (
        <Box paddingLeft={2} marginBottom={0} flexDirection="column">
          <Select
            options={selectOptions}
            visibleOptionCount={MAX_SUGGESTIONS}
            highlightText={currentMention ?? undefined}
            onChange={handleSelectChange}
          />
        </Box>
      )}

      {/* Input line */}
      <Box>
        <Text color="cyan" bold>
          {prompt}
        </Text>
        <Text>{beforeMention}</Text>
        {mentionQuery !== null && (
          <>
            <Text color="yellow">{mentionText}</Text>
            <Text color="gray" dimColor>
              {ghostPart}
            </Text>
          </>
        )}
        <Text color="cyan">│</Text>
        <Text>{afterCursor}</Text>
      </Box>
    </Box>
  );
}

function isSelectablePath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ds_store")) return false;
  if (lower.includes("/node_modules/") || lower.includes("/.git/"))
    return false;
  if (
    lower.includes("/dist/") ||
    lower.includes("/build/") ||
    lower.includes("/coverage/")
  )
    return false;
  return true;
}
