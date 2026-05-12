/** @jsxRuntime automatic */
/** @jsxImportSource terminui */

import type { UIState } from "../store.js";
import { Color, type Style } from "terminui";
import { Label, VStack, Panel } from "terminui/jsx";
import { fgStyle } from "./helpers.js";

export function ConfirmDialog({ state }: { state: UIState }) {
  const { confirm } = state;
  if (!confirm.active) return null;

  return (
    <Panel title={confirm.toolName} border>
      <VStack>
        <Label style={fgStyle(Color.White)} text="  wants to edit files" />
        {confirm.preview && (
          <PreviewLines preview={confirm.preview} />
        )}
        <Label
          style={fgStyle(Color.Green)}
          text="  [y]es  [n]o  [a]ll (accept all)"
        />
      </VStack>
    </Panel>
  );
}

function PreviewLines({ preview }: { preview: string }) {
  const lines = preview.split("\n").slice(0, 8);
  return (
    <VStack>
      {lines.map((line) => {
        let color: Style["fg"] = Color.DarkGray;
        if (line.startsWith("+")) color = Color.Green;
        else if (line.startsWith("-")) color = Color.Red;
        return <Label style={fgStyle(color)} text={`  ${line.slice(0, 60)}`} />;
      })}
    </VStack>
  );
}
