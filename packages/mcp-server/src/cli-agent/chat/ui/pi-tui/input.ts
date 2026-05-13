import type { Editor } from "@earendil-works/pi-tui";
import { COMMANDS } from "./theme.js";

export function completeCommand(editor: Editor): boolean {
  const value = editor.getText();
  if (!value.startsWith("/")) return false;
  const match = COMMANDS.find((cmd) => cmd.startsWith(value));
  if (!match || match === value) return false;
  editor.setText(match + " ");
  return true;
}
