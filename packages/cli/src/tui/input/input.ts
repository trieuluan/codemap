import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";
import { searchIndexedFiles } from "../../agent/utils/file-search.js";
import type { GatewayModel } from "../../agent/types.js";
import type { HarnessThread } from "../../agent/runtime/events.js";
import { formatSessionLabel } from "../../chat/slash-commands/sessions.js";

/**
 * Dedicated provider for the model picker overlay.
 * Shows a flat list of all available models.
 * applyCompletion calls onSelect then onClose (scheduled after current tick).
 */
export class ModelPickerProvider implements AutocompleteProvider {
  constructor(
    private getModels: () => GatewayModel[],
    private getCurrentModel: () => string,
    private onSelect: (model: string) => void,
    private onClose: () => void,
  ) {}

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    _options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    const current = this.getCurrentModel();
    const available = this.getModels();

    if (available.length === 0) return null;

    const query = (lines[cursorLine] ?? "").slice(0, cursorCol).toLowerCase();
    const filtered = query
      ? available.filter((m) => m.id.toLowerCase().includes(query))
      : available;

    // Don't return null for empty filtered results — returning an empty items array
    // keeps the autocomplete UI alive so it can update when the user edits the query.
    // Returning null would call cancelAutocomplete(), and the editor only re-triggers
    // for slash-command or symbol contexts, not for generic providers like the model picker.
    if (filtered.length === 0) {
      return { prefix: query, items: [{ value: "", label: "No matches", description: "" }] };
    }

    const items: AutocompleteItem[] = filtered.map((m) => ({
      value: m.id,
      label: m.id,
      description: m.id === current ? "✓ active" : (m.ownedBy ?? ""),
    }));

    return { prefix: query, items };
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    _cursorCol: number,
    item: AutocompleteItem,
    _prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    // Skip "No matches" placeholder
    if (!item.value) {
      return { lines: [...lines], cursorLine, cursorCol: 0 };
    }
    this.onSelect(item.value);
    // Schedule close after this tick so editor finishes apply before provider swaps back
    setTimeout(() => this.onClose(), 0);
    // Clear the input line
    const newLines = [...lines];
    newLines[cursorLine] = "";
    return { lines: newLines, cursorLine, cursorCol: 0 };
  }
}

/**
 * Dedicated provider for the session/thread picker overlay.
 * Shows a flat list of saved chat threads filtered by query.
 * applyCompletion calls onSelect then onClose (scheduled after current tick).
 */
export class SessionPickerProvider implements AutocompleteProvider {
  constructor(
    private getThreads: () => HarnessThread[],
    private getCurrentThreadId: () => string | null,
    private onSelect: (threadId: string) => void,
    private onClose: () => void,
  ) {}

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    _options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    const currentId = this.getCurrentThreadId();
    const threads = this.getThreads();

    if (threads.length === 0) return null;

    const query = (lines[cursorLine] ?? "").slice(0, cursorCol).toLowerCase();
    const filtered = query
      ? threads.filter(
          (t) =>
            t.id.toLowerCase().includes(query) ||
            (t.title ?? "").toLowerCase().includes(query),
        )
      : threads;

    if (filtered.length === 0) {
      return { prefix: query, items: [{ value: "", label: "No matches", description: "" }] };
    }

    const items: AutocompleteItem[] = filtered.map((t) => ({
      value: t.id,
      label: formatSessionLabel(t, t.id === currentId),
      description: t.id === currentId ? "✓ active" : "",
    }));

    return { prefix: query, items };
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    _cursorCol: number,
    item: AutocompleteItem,
    _prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    if (!item.value) {
      return { lines: [...lines], cursorLine, cursorCol: 0 };
    }
    this.onSelect(item.value);
    setTimeout(() => this.onClose(), 0);
    const newLines = [...lines];
    newLines[cursorLine] = "";
    return { lines: newLines, cursorLine, cursorCol: 0 };
  }
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

interface SlashEntry { value: string; description: string }

export interface MentionAutocompleteOptions {
  commands?: SlashEntry[];
}

export class MentionAutocompleteProvider implements AutocompleteProvider {
  private commands: SlashEntry[];

  constructor(commandsOrOptions: SlashEntry[] | MentionAutocompleteOptions = []) {
    if (Array.isArray(commandsOrOptions)) {
      this.commands = commandsOrOptions;
    } else {
      this.commands = commandsOrOptions.commands ?? [];
    }
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

