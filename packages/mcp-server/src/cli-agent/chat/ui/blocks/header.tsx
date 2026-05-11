/** @jsxRuntime automatic */
/** @jsxImportSource terminui */
import { Color, createStyle, styleFg } from "terminui";
import { Panel, Column, Label } from "terminui/jsx";
import type { UIState } from "../store.js";
import { getModeDisplay } from "../../commands/route-policy.js";
import { colorByMode } from "./helpers.js";

export function HeaderBlock({ state }: { state: UIState }) {
  const { config } = state;
  const modeInfo = getModeDisplay(config.mode);
  const width = state.viewport.width;

  const valueWhite = styleFg(createStyle(), Color.White);
  const valueCyan = styleFg(createStyle(), Color.Cyan);
  const valueGreen = styleFg(createStyle(), Color.Green);
  const valueMagenta = styleFg(createStyle(), Color.Magenta);

  return (
    <>
      <Banner width={width} />
      <Panel
        title="Session"
        border
        p={1}
        fg={Color.DarkGray}
      >
        <Column constraints={[]}>
          <LabelRow label="Version" value="v0.1.0" valueStyle={valueWhite} />
          <LabelRow label="Model" value={config.model} valueStyle={valueCyan} />
          <LabelRow label="Mode" value={modeInfo.label} valueStyle={colorByMode(config.mode)} />
          <LabelRow label="Profile" value={config.profile} valueStyle={valueWhite} />
          {config.availableModels.length > 0 && (
            <LabelRow label="Models" value={`${config.availableModels.length} available`} valueStyle={valueGreen} />
          )}
          <LabelRow label="MCP" value="Connected" valueStyle={valueGreen} />
          <LabelRow label="Branch" value="master" valueStyle={valueMagenta} />
        </Column>
      </Panel>
    </>
  );
}

function Banner({ width }: { width: number }) {
  const text = width < 90 ? "CodeMap" : "CODEMAP";
  const subtitle = "AI-powered code intelligence & agent platform";

  return (
    <Column>
      <Label
        text={text}
        bold
        fg={Color.Cyan}
        align="center"
      />
      <Label
        text={subtitle}
        fg={Color.Cyan}
        align="center"
      />
    </Column>
  );
}

function LabelRow({ label, value, valueStyle }: { label: string; value: string; valueStyle: import("terminui").Style }) {
  const labelFormatted = label.padEnd(12);
  return (
    <Label>
      <Label text={labelFormatted} fg={Color.Gray} />
      <Label text={value} style={valueStyle} />
    </Label>
  );
}
