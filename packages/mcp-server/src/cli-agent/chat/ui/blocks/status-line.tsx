/** @jsxRuntime automatic */
/** @jsxImportSource terminui */

import type { UIState } from "../store.js";
import { Label } from "terminui/jsx";
import { dimStyle } from "./helpers.js";
import { getModeDisplay } from "../../commands/route-policy.js";

export function StatusLine({ state }: { state: UIState }) {
  const { config } = state;
  const modeInfo = getModeDisplay(config.mode);
  const debugStr = config.debug ? "On" : "Off";

  return (
    <Label
      style={dimStyle()}
      text={`  ${config.model}  ·  ${modeInfo.label}  ·  Debug: ${debugStr}`}
    />
  );
}
