import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";
import type { Editor } from "@earendil-works/pi-tui";
import { searchIndexedFiles } from "../../file-search.js";
import { COMMANDS } from "./theme.js";

export function completeCommand(editor: Editor): boolean {
  const value = editor.getText();
  if (!value.startsWith("/")) return false;
  const match = COMMANDS.find((cmd) => cmd.startsWith(value));
  if (!match || match === value) return false;
  editor.setText(match + " ");
  return true;
}

const AT_DELIMITERS = new Set([" ", "\t", '"', "'", "="]);

function extractAtPrefix(textBeforeCursor: string): string | null {
  let lastDelimIdx = -1;
  for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
    if (AT_DELIMITERS.has(textBeforeCursor[i] ?? "")) {
      lastDelimIdx = i;
      break;
    }
  }
  const tokenStart = lastDelimIdx === -1 ? 0 : lastDelimIdx + 1;
  if (textBeforeCursor[tokenStart] === "@") {
    return textBeforeCursor.slice(tokenStart);
  }
  return null;
}

export class MentionAutocompleteProvider implements AutocompleteProvider {
  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    const currentLine = lines[cursorLine] ?? "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    const atPrefix = extractAtPrefix(textBeforeCursor);
    if (atPrefix !== null) {
      const query = atPrefix.slice(1);
      const files = await searchIndexedFiles(query);
      if (options.signal.aborted) return null;
      if (files.length === 0) return null;
      return {
        prefix: atPrefix,
        items: files.map((f) => ({
          value: f.path,
          label: f.label ?? f.path,
        })),
      };
    }

    if (!options.force && textBeforeCursor.trimStart().startsWith("/")) {
      const spaceIdx = textBeforeCursor.indexOf(" ");
      if (spaceIdx === -1) {
        const filtered = (COMMANDS as readonly string[]).filter((cmd) =>
          cmd.startsWith(textBeforeCursor.trimStart()),
        );
        if (filtered.length === 0) return null;
        return {
          prefix: textBeforeCursor.trimStart(),
          items: filtered.map((cmd) => ({ value: cmd, label: cmd })),
        };
      }
    }

    return null;
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    const line = lines[cursorLine] ?? "";
    const before = line.slice(0, cursorCol - prefix.length);
    const after = line.slice(cursorCol);
    const replacement = prefix.startsWith("@") ? `@${item.value} ` : `${item.value} `;
    const newLine = before + replacement + after;
    const newLines = [...lines];
    newLines[cursorLine] = newLine;
    return { lines: newLines, cursorLine, cursorCol: before.length + replacement.length };
  }
}
