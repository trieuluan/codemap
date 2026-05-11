import type { Terminal } from "terminal-kit";
import { searchIndexedFiles, type IndexedFileOption } from "../file-search.js";

export interface InputHandlerOptions {
  term: Terminal;
  inputHistory?: string[];
  onAbort?: () => void;
}

/**
 * Read a line from the terminal with @mention autocomplete support.
 * Returns the submitted text, or null if aborted (Ctrl+C on empty).
 */
export async function readLine(opts: InputHandlerOptions): Promise<string | null> {
  const { term, inputHistory = [], onAbort } = opts;

  // Draw input prompt with a subtle box style
  term("\n");
  term.bold.cyan("  > ");

  return new Promise<string | null>((resolve) => {
    const history = [...inputHistory];

    term.inputField(
      {
        history,
        autoComplete: buildAutoComplete(),
        autoCompleteMenu: true,
        autoCompleteHint: true,
        cancelable: true,
        echo: true,
      },
      (err, input) => {
        if (err) {
          resolve(null);
          return;
        }
        // input is undefined when cancelled (Escape or Ctrl+C)
        if (input == null) {
          onAbort?.();
          resolve(null);
          return;
        }
        const trimmed = input.trim();
        if (!trimmed) {
          resolve(null);
          return;
        }
        resolve(trimmed);
      },
    );
  });
}

/**
 * Build autocomplete function for terminal-kit's inputField.
 * When user types @query, provides file path suggestions.
 */
function buildAutoComplete(): (
  inputString: string,
) => Promise<string[]> {
  const fileCache = new Map<string, IndexedFileOption[]>();

  return async (inputString: string): Promise<string[]> => {
    // Extract @mention query from the current input
    const mentionMatch = inputString.match(/@([^\s@]*)$/);
    if (!mentionMatch) return [];

    const query = mentionMatch[1];

    // Cache results per query to avoid repeated searches
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
