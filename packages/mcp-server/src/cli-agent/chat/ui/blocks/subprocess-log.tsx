/** @jsxRuntime automatic */
/** @jsxImportSource terminui */

import type { UIState } from "../store.js";
import { Label, VStack, Panel } from "terminui/jsx";
import { dimStyle } from "./helpers.js";

export function SubprocessLog({ state }: { state: UIState }) {
  const { subprocess } = state;
  if (!subprocess.active) return null;

  const lastLines = subprocess.logLines.slice(-10);

  return (
    <Panel title={subprocess.command} border>
      <VStack>
        {lastLines.map((line) => (
          <Label style={dimStyle()} text={`  ${line.slice(0, 70)}`} />
        ))}
      </VStack>
    </Panel>
  );
}
