/** @jsxRuntime automatic */
/** @jsxImportSource terminui */
import { Color, createStyle, styleFg } from "terminui";
import { Label, Column } from "terminui/jsx";
import type { UIState } from "../store.js";
import { formatElapsed, formatTokenCount, SPINNER_FRAMES } from "./helpers.js";

const dimGray = styleFg(createStyle(), Color.Gray);
const whiteStyle = styleFg(createStyle(), Color.White);
const cyanStyle = styleFg(createStyle(), Color.Cyan);
const dimCyan = styleFg(createStyle(), Color.DarkGray);
const yellowStyle = styleFg(createStyle(), Color.Yellow);
const greenStyle = styleFg(createStyle(), Color.Green);

export function TaskStatusBlock({ state, spinnerFrame }: { state: UIState; spinnerFrame: number }) {
  const { task } = state;
  if (task.phase === "idle") return null;

  const elapsed = task.startTime
    ? (task.endTime ?? Date.now()) - task.startTime
    : 0;
  const elapsedStr = formatElapsed(elapsed);
  const spinner = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];

  switch (task.phase) {
    case "thinking":
      return (
        <Label>
          <Label text={spinner} style={cyanStyle} />
          <Label text=" Thinking" style={whiteStyle} />
          <Label text={` ${elapsedStr}`} style={dimGray} />
          {task.model && <Label text={` · ${task.model}`} style={dimCyan} />}
        </Label>
      );

    case "tool":
      return (
        <Column>
          <Label>
            <Label text={spinner} style={yellowStyle} />
            <Label text={` ${task.toolName ?? "tool"}`} style={yellowStyle} />
            <Label text={` ${elapsedStr}`} style={dimGray} />
          </Label>
          {task.toolArgs && (
            <Label text={task.toolArgs.length > 100 ? task.toolArgs.slice(0, 100) + "..." : task.toolArgs} style={dimGray} />
          )}
        </Column>
      );

    case "streaming":
      return (
        <Label>
          <Label text="↓" style={cyanStyle} />
          <Label text=" Streaming" style={whiteStyle} />
          <Label text={` ${elapsedStr}`} style={dimGray} />
          {task.usage && (
            <Label text={` · ${formatTokenCount(task.usage.promptTokens)} in / ${formatTokenCount(task.usage.completionTokens)} out`} style={dimGray} />
          )}
        </Label>
      );

    case "done":
      return (
        <Label>
          <Label text="✓" style={greenStyle} />
          <Label text={` ${elapsedStr}`} style={whiteStyle} />
          {task.toolsCalled > 0 && (
            <Label text={` · ${task.toolsCalled} tool${task.toolsCalled > 1 ? "s" : ""}`} style={dimGray} />
          )}
          {task.usage && (
            <Label text={` · ${formatTokenCount(task.usage.totalTokens)} tokens`} style={dimGray} />
          )}
        </Label>
      );

    default:
      return null;
  }
}
