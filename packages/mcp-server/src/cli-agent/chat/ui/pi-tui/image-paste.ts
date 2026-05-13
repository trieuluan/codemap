import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, extname, isAbsolute, resolve } from "node:path";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export interface PastedImage {
  marker: string;
  markdown: string;
}

export async function imageFromPaste(data: string): Promise<PastedImage | null> {
  const trimmed = data.trim();
  if (!trimmed) return null;

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

  const filePath = isAbsolute(pathText) ? pathText : resolve(process.cwd(), pathText);
  const info = await stat(filePath);
  if (!info.isFile()) return null;
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
}

function extractSinglePath(value: string): string | null {
  const unquoted = value.replace(/^['"]|['"]$/g, "");
  if (unquoted.startsWith("file://")) {
    return fileURLToPath(unquoted);
  }
  if (/[\r\n]/.test(unquoted)) return null;
  if (isAbsolute(unquoted) || unquoted.startsWith("./") || unquoted.startsWith("../")) {
    return unquoted;
  }
  return null;
}
