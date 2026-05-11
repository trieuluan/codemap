/** @jsxRuntime automatic */
/** @jsxImportSource terminui */
import { Color, createStyle, styleFg } from "terminui";
import { Panel, Column, Label } from "terminui/jsx";
import type { UIState } from "../store.js";

const dimGray = styleFg(createStyle(), Color.DarkGray);
const cyanStyle = styleFg(createStyle(), Color.Cyan);

const MAX_VISIBLE_LINES = 30;

export function SubprocessLogBlock({ state }: { state: UIState }) {
  const { subprocess } = state;
  if (!subprocess.active && subprocess.logLines.length === 0) return null;

  const cmdLabel = subprocess.command;
  const visibleLines = subprocess.logLines.slice(-MAX_VISIBLE_LINES);
  const overflow = subprocess.logLines.length - MAX_VISIBLE_LINES;

  return (
    <Panel title={cmdLabel} border p={1} fg={Color.Yellow}>
      <Column>
        {visibleLines.map((line, i) => (
          <Label key={i} text={line.slice(0, 74)} style={dimGray} />
        ))}
        {overflow > 0 && (
          <Label text={`... ${overflow} more lines`} style={dimGray} />
        )}
        {subprocess.active && (
          <Label text="⟳ running..." style={cyanStyle} />
        )}
      </Column>
    </Panel>
  );
}
