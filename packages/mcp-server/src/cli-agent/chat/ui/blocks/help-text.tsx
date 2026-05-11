/** @jsxRuntime automatic */
/** @jsxImportSource terminui */
import { Color, Modifier, createStyle, styleFg, styleAddModifier } from "terminui";
import { Label } from "terminui/jsx";
import type { UIState } from "../store.js";

const dimGray = styleFg(createStyle(), Color.Gray);
const boldCyan = styleAddModifier(styleFg(createStyle(), Color.Cyan), Modifier.BOLD);

function Keycap({ key, label }: { key: string; label: string }) {
  return (
    <Label>
      <Label text="[" style={boldCyan} />
      <Label text={key} style={boldCyan} />
      <Label text="]" style={boldCyan} />
      <Label text={` ${label}  `} style={dimGray} />
    </Label>
  );
}

export function HelpTextBlock({ state: _state }: { state: UIState }) {
  return (
    <Label>
      <Keycap key="/" label="commands" />
      <Keycap key="@" label="files" />
      <Keycap key="Tab" label="suggestions" />
      <Keycap key="Ctrl+C" label="cancel" />
      <Keycap key="?" label="help" />
    </Label>
  );
}
