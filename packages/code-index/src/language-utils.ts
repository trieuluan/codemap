import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import path from "node:path";

export const SOURCE_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  dart: "Dart",
  php: "PHP",
  py: "Python",
  po: "Gettext",
};

export const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  ts: "text/plain",
  tsx: "text/plain",
  js: "text/javascript",
  jsx: "text/javascript",
  dart: "text/plain",
  php: "text/x-php",
};

export const BINARY_SAMPLE_BYTES = 8192;

export function normalizeExtension(fileName: string) {
  const extension = path.extname(fileName).slice(1).trim().toLowerCase();
  return extension || null;
}

export function inferLanguage(extension: string | null) {
  if (!extension) return null;
  return SOURCE_LANGUAGE_BY_EXTENSION[extension] ?? null;
}

export function inferMimeType(extension: string | null) {
  if (!extension) return null;
  return MIME_TYPE_BY_EXTENSION[extension] ?? null;
}

export function isBinaryBuffer(buffer: Buffer) {
  for (const byte of buffer) {
    if (byte === 0) return true;
  }
  return false;
}

export async function readSampleBuffer(filePath: string, sizeBytes: number) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(Math.min(sizeBytes, BINARY_SAMPLE_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function buildFileSha256(content: Buffer | string) {
  return createHash("sha256").update(content).digest("hex");
}
