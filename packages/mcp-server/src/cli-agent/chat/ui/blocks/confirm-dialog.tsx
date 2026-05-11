/** @jsxRuntime automatic */
/** @jsxImportSource terminui */
import { Color, Modifier, createStyle, styleFg, styleAddModifier } from "terminui";
import type { Style } from "terminui";
import { Panel, Column, Label } from "terminui/jsx";
import type { UIState } from "../store.js";

const dimGray = styleFg(createStyle(), Color.DarkGray);
const whiteStyle = styleFg(createStyle(), Color.White);
const greenStyle = styleAddModifier(styleFg(createStyle(), Color.Green), Modifier.BOLD);
const redBold = styleAddModifier(styleFg(createStyle(), Color.Red), Modifier.BOLD);
const cyanBold = styleAddModifier(styleFg(createStyle(), Color.Cyan), Modifier.BOLD);
const grayStyle = styleFg(createStyle(), Color.Gray);
const greenLineStyle = styleFg(createStyle(), Color.Green);
const redLineStyle = styleFg(createStyle(), Color.Red);

export function ConfirmDialogBlock({ state }: { state: UIState }) {
  const { confirm } = state;
  if (!confirm.active) return null;

  return (
    <Panel title={confirm.toolName} border p={1} fg={Color.Yellow}>
      <Column>
        <Label text="wants to edit files" style={whiteStyle} />
        {confirm.preview && (
          <PreviewLines preview={confirm.preview} />
        )}
        <Label>
          <Label text="y" style={greenStyle} />
          <Label text="es  " style={grayStyle} />
          <Label text="n" style={redBold} />
          <Label text="o  " style={grayStyle} />
          <Label text="a" style={cyanBold} />
          <Label text="ll (accept all)" style={grayStyle} />
        </Label>
      </Column>
    </Panel>
  );
}

function PreviewLines({ preview }: { preview: string }) {
  const lines = preview.split("\n").slice(0, 15);
  return (
    <Column>
      {lines.map((line, i) => {
        const trimmed = line.slice(0, 60);
        let lineStyle: Style = dimGray;
        if (trimmed.startsWith("+")) lineStyle = greenLineStyle;
        else if (trimmed.startsWith("-")) lineStyle = redLineStyle;
        return <Label key={i} text={trimmed} style={lineStyle} />;
      })}
    </Column>
  );
}
