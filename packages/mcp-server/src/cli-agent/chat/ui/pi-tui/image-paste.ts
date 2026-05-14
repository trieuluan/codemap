import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { basename, extname, isAbsolute, resolve } from "node:path";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export interface PastedImage {
  marker: string;
  markdown: string;
}

// Read PNG image from macOS clipboard via osascript.
// Returns base64 PNG string or null if clipboard has no image.
async function readClipboardImage(): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  return new Promise((resolve) => {
    // osascript writes raw PNG bytes to stdout when clipboard contains an image
    execFile(
      "osascript",
      ["-e", "set imgData to the clipboard as «class PNGf»\nset out to do shell script \"xxd -p\" with input imgData\nreturn out"],
      { maxBuffer: MAX_IMAGE_BYTES * 2 },
      (err, stdout) => {
        if (err || !stdout.trim()) { resolve(null); return; }
        try {
          const hex = stdout.trim().replace(/\s+/g, "");
          const buf = Buffer.from(hex, "hex");
          resolve(buf.toString("base64"));
        } catch {
          resolve(null);
        }
      },
    );
  });
}

export async function imageFromPaste(data: string): Promise<PastedImage | null> {
  // Strip bracketed paste markers (\x1b[200~...\x1b[201~) that terminals wrap
  // around drag-and-drop content — without this, the path isn't recognized as
  // an absolute path and falls through to the editor as plain text.
  const bracketedContent = data.match(/^\x1b\[200~([\s\S]*?)\x1b\[201~$/);
  const trimmed = (bracketedContent ? bracketedContent[1] : data).trim();
  if (!trimmed) return null;

  // Inline base64 data URL (from browser paste or iTerm2 image protocol)
  const dataUrl = trimmed.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=\s]+)$/i);
  if (dataUrl) {
    const mime = dataUrl[1]!.toLowerCase();
    const base64 = dataUrl[2]!.replace(/\s+/g, "");
    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) {
      throw new Error("Image paste is too large. Max size is 5 MB.");
    }
    return {
      marker: `[image: pasted ${mime.split("/")[1]}]`,
      markdown: `![pasted image](data:${mime};base64,${base64})`,
    };
  }

  const pathText = extractSinglePath(trimmed);
  if (!pathText) return null;

  const ext = extname(pathText).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) return null;

  // Try multiple path variants: original → URL-decoded → clipboard fallback.
  // Browser drag-and-drop sometimes creates temp files that get cleaned up
  // before we can stat them; in that case, read the image from the clipboard.
  const candidates = [pathText, tryUrlDecode(pathText)].filter(
    (p, i, arr) => p !== null && arr.indexOf(p) === i,
  ) as string[];

  for (const candidate of candidates) {
    const filePath = isAbsolute(candidate) ? candidate : resolve(process.cwd(), candidate);
    try {
      const info = await stat(filePath);
      if (!info.isFile()) continue;
      if (info.size > MAX_IMAGE_BYTES) {
        throw new Error(`Image is too large (${Math.ceil(info.size / 1024 / 1024)} MB). Max size is 5 MB.`);
      }
      const bytes = await readFile(filePath);
      const base64 = bytes.toString("base64");
      const name = basename(filePath);
      return {
        marker: `[image: ${name}]`,
        markdown: `![${name}](data:${mime};base64,${base64})`,
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      // ENOENT — try next candidate or fall through to clipboard
    }
  }

  // File not found via path — try clipboard (covers browser drag-drop where
  // the temp file is cleaned up before we can read it, like Claude Code does)
  if (ext === ".png" || mime === "image/png") {
    const clipBase64 = await readClipboardImage();
    if (clipBase64) {
      const name = basename(pathText);
      return {
        marker: `[image: ${name}]`,
        markdown: `![${name}](data:image/png;base64,${clipBase64})`,
      };
    }
  }

  throw new Error(`Image not found: ${basename(pathText)}`);
}

function extractSinglePath(value: string): string | null {
  const unquoted = value.replace(/^['"]|['"]$/g, "");
  if (unquoted.startsWith("file://")) {
    try { return fileURLToPath(unquoted); } catch { return null; }
  }
  if (/[\r\n]/.test(unquoted)) return null;
  // Unescape all shell escape sequences: "\X" → "X" (covers "\ ", "\,", "\(", etc.)
  // macOS Terminal escapes every special character when inserting a drag-dropped path.
  const unescaped = unquoted.replace(/\\(.)/g, "$1");
  if (isAbsolute(unescaped) || unescaped.startsWith("./") || unescaped.startsWith("../")) {
    return unescaped;
  }
  return null;
}

function tryUrlDecode(p: string): string | null {
  try {
    const decoded = decodeURIComponent(p);
    return decoded !== p ? decoded : null;
  } catch {
    return null;
  }
}
