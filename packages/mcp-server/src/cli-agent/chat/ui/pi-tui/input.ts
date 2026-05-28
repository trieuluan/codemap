import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";
import { searchIndexedFiles } from "../../../core/file-search.js";

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

interface SlashEntry { value: string; description: string }

export class MentionAutocompleteProvider implements AutocompleteProvider {
  private commands: SlashEntry[];

  constructor(commands: SlashEntry[] = []) {
    this.commands = commands;
  }

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
        const typed = textBeforeCursor.trimStart();
        const filtered = this.commands.filter((c) => c.value.startsWith(typed));
        if (filtered.length === 0) return null;
        return {
          prefix: typed,
          items: filtered.map((c) => ({
            value: c.value,
            label: c.value,
            description: c.description,
          })),
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

const PLAN_REVIEW_ITEMS = [
  { value: "implement", label: "implement", description: "Proceed with implementation (planner → coder → reviewer)" },
  { value: "no",        label: "no",        description: "Cancel — don't implement this plan" },
  { value: "revise",    label: "revise",    description: "Type your changes + Enter to update the plan" },
];

/** Shown while the multi-phase loop is waiting for plan review. */
export class PlanReviewAutocompleteProvider implements AutocompleteProvider {
  async getSuggestions(
    _lines: string[],
    _cursorLine: number,
    _cursorCol: number,
    _options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    // Always show the two options so the user knows what to pick.
    return { prefix: "", items: PLAN_REVIEW_ITEMS };
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
    const newLine = before + item.value + after;
    const newLines = [...lines];
    newLines[cursorLine] = newLine;
    return { lines: newLines, cursorLine, cursorCol: before.length + item.value.length };
  }
}
