import { spawnSync } from "node:child_process";

/** Copy text to the system clipboard. Returns true on success. */
export function copyToClipboard(text: string): boolean {
  try {
    if (process.platform === "darwin") {
      return spawnSync("pbcopy", { input: text, encoding: "utf8" }).status === 0;
    }
    if (process.platform === "linux") {
      if (spawnSync("xclip", ["-selection", "clipboard"], { input: text, encoding: "utf8" }).status === 0) return true;
      if (spawnSync("xsel", ["--clipboard", "--input"], { input: text, encoding: "utf8" }).status === 0) return true;
      if (spawnSync("wl-copy", [], { input: text, encoding: "utf8" }).status === 0) return true;
    }
    if (process.platform === "win32") {
      return spawnSync("clip", { input: text, encoding: "utf8" }).status === 0;
    }
  } catch { /* ignore */ }
  return false;
}
