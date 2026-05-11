/** @jsxRuntime automatic */
/** @jsxImportSource terminui */
import { Color, Modifier, createStyle, styleFg, styleAddModifier } from "terminui";
import { Label } from "terminui/jsx";
import type { UIState } from "../store.js";
import { getModeDisplay } from "../../commands/route-policy.js";
import { colorByMode } from "./helpers.js";

const dimGray = styleFg(createStyle(), Color.Gray);
const grayStyle = styleFg(createStyle(), Color.Gray);
const cyanStyle = styleFg(createStyle(), Color.Cyan);
const boldRed = styleAddModifier(styleFg(createStyle(), Color.Red), Modifier.BOLD);
const boldGreen = styleAddModifier(styleFg(createStyle(), Color.Green), Modifier.BOLD);

export function StatusLineBlock({ state }: { state: UIState }) {
  const { config, input } = state;
  const modeInfo = getModeDisplay(config.mode);

  return (
    <Label>
      <Label text="Model: " style={grayStyle} />
      <Label text={config.model} style={cyanStyle} />
      <Label text=" · " style={dimGray} />
      <Label text="Mode: " style={grayStyle} />
      <Label text={modeInfo.label} style={colorByMode(config.mode)} />
      <Label text=" · " style={dimGray} />
      <Label text="Debug: " style={grayStyle} />
      {config.debug ? (
        <Label text="On" style={boldRed} />
      ) : (
        <Label text="Off" style={dimGray} />
      )}
      {input.autoAccept && (
        <>
          <Label text=" · " style={dimGray} />
          <Label text="ACCEPT ALL" style={boldGreen} />
        </>
      )}
    </Label>
  );
}
