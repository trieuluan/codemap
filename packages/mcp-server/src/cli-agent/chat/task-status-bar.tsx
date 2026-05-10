import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { Spinner, Badge } from "@inkjs/ui";

export type TaskPhase = "idle" | "thinking" | "tool" | "streaming" | "done";

export interface TaskStatus {
  phase: TaskPhase;
  toolName?: string;
  toolArgs?: string;
  startTime?: number;
  endTime?: number;
  text?: string;
  toolsCalled: number;
}

function useElapsed(startTime?: number, endTime?: number): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    const update = () => setElapsed(Date.now() - startTime);
    update();
    if (endTime) return;
    const id = setInterval(update, 100);
    return () => clearInterval(id);
  }, [startTime, endTime]);

  if (startTime && endTime) return endTime - startTime;
  return elapsed;
}

function formatElapsed(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(0);
  return `${m}m${sec}s`;
}

function truncateArgs(args: string | undefined, max: number): string {
  if (!args) return "";
  if (args.length <= max) return args;
  return args.slice(0, max) + "...";
}

export function TaskStatusBar({ status }: { status: TaskStatus }) {
  const elapsed = useElapsed(status.startTime, status.endTime);
  const elapsedStr = formatElapsed(elapsed);

  if (status.phase === "idle") return null;

  const borderColor =
    status.phase === "tool"
      ? "yellow"
      : status.phase === "streaming"
        ? "cyan"
        : status.phase === "done"
          ? "green"
          : "gray";

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
    >
      <Box gap={1}>
        {status.phase === "thinking" && (
          <>
            <Spinner label={`Thinking...  ${elapsedStr}`} />
          </>
        )}

        {status.phase === "tool" && (
          <>
            <Spinner label={status.toolName ?? "tool"} />
            <Badge color="yellow">{status.toolName}</Badge>
            <Text color="gray" dimColor>
              {elapsedStr}
            </Text>
          </>
        )}

        {status.phase === "streaming" && (
          <>
            <Text color="cyan">↓</Text>
            <Text color="cyan" bold>
              Streaming
            </Text>
            <Text color="gray" dimColor>
              {elapsedStr}
            </Text>
          </>
        )}

        {status.phase === "done" && (
          <>
            <Text color="green" bold>
              ✓
            </Text>
            <Text color="green">
              Completed in {elapsedStr}
            </Text>
            {status.toolsCalled > 0 && (
              <Text color="gray">· {status.toolsCalled} tool{status.toolsCalled > 1 ? "s" : ""} called</Text>
            )}
          </>
        )}
      </Box>

      {/* Tool args preview */}
      {status.phase === "tool" && status.toolArgs && (
        <Box paddingLeft={2}>
          <Text color="gray" dimColor>
            {truncateArgs(status.toolArgs, 120)}
          </Text>
        </Box>
      )}

      {/* Streaming text preview */}
      {status.phase === "streaming" && status.text && (
        <Box paddingLeft={2} marginTop={0}>
          <Text wrap="wrap" dimColor>
            {truncatePreview(status.text, 200)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function truncatePreview(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(text.length - max);
}
