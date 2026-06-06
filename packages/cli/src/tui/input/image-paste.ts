import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { basename, extname, isAbsolute, resolve } from "node:path";
import { optimizeImageForModel } from "../../agent/utils/image-optimizer.js";

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
  data: string;
  mimeType: string;
}

async function toPastedImage(marker: string, buffer: Buffer, mimeType: string): Promise<PastedImage> {
  const optimized = await optimizeImageForModel(buffer, mimeType, { maxBytes: MAX_IMAGE_BYTES });
  return {
    marker,
    data: optimized.buffer.toString("base64"),
    mimeType: optimized.mimeType,
  };
}

// Read PNG image from macOS clipboard via osascript.
// Returns raw Buffer or null if clipboard has no image.
async function readClipboardImage(): Promise<Buffer | null> {
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
          resolve(buf);
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
    const buffer = Buffer.from(base64, "base64");
    return toPastedImage(`[image: pasted ${mime.split("/")[1]}]`, buffer, mime);
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
      const bytes = await readFile(filePath);
      const name = basename(filePath);
      return toPastedImage(`[image: ${name}]`, bytes, mime);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      // ENOENT — try next candidate or fall through to clipboard
    }
  }

  // File not found via path — try clipboard (covers browser drag-drop where
  // the temp file is cleaned up before we can read it, like Claude Code does)
  if (ext === ".png" || mime === "image/png") {
    const clipBuffer = await readClipboardImage();
    if (clipBuffer) {
      const name = basename(pathText);
      return toPastedImage(`[image: ${name}]`, clipBuffer, "image/png");
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
