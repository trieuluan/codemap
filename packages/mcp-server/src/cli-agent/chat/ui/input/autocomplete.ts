import { searchIndexedFiles, type IndexedFileOption } from "../../file-search.js";

/**
 * Build autocomplete function for terminal-kit's inputField.
 * When user types @query, provides file path suggestions.
 */
export function buildAutoComplete(): (
  inputString: string,
) => Promise<string[]> {
  const fileCache = new Map<string, IndexedFileOption[]>();

  return async (inputString: string): Promise<string[]> => {
    const mentionMatch = inputString.match(/@([^\s@]*)$/);
    if (!mentionMatch) return [];

    const query = mentionMatch[1];

    if (fileCache.has(query)) {
      return fileCache.get(query)!.map((f) => f.path);
    }

    try {
      const results = await searchIndexedFiles(query);
      const filtered = results
        .filter((f) => isSelectablePath(f.path))
        .slice(0, 8);
      fileCache.set(query, filtered);
      return filtered.map((f) => f.path);
    } catch {
      return [];
    }
  };
}

function isSelectablePath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ds_store")) return false;
  if (lower.includes("/node_modules/") || lower.includes("/.git/")) return false;
  if (
    lower.includes("/dist/") ||
    lower.includes("/build/") ||
    lower.includes("/coverage/")
  )
    return false;
  return true;
}
