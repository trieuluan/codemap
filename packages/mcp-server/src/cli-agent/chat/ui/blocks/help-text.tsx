/** @jsxRuntime automatic */
/** @jsxImportSource terminui */

import { Label } from "terminui/jsx";
import { dimStyle } from "./helpers.js";

export function HelpText() {
  return (
    <Label
      style={dimStyle()}
      text="  / commands  @ files  Tab suggestions  Ctrl+C cancel"
    />
  );
}
