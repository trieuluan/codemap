import type { WorkspaceFileCandidate } from "../file-discovery";
import { buildImportLocalKey, buildLocalSymbolKey, buildStableSymbolKey } from "./shared";
import { EMPTY_SEMANTICS, type ParsedWorkspaceSemantics } from "./types";

interface PoEntry {
  msgid: string;
  msgstr: string;
  references: string[];
  extractedComment: string | null;
  line: number; // line number of the msgid directive
}

function emitEntry(
  entry: PoEntry,
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  semantics: ParsedWorkspaceSemantics,
  projectImportId: string,
) {
  if (!entry.msgid) return;

  const isTranslated = entry.msgstr.trim().length > 0;

  semantics.symbols.push({
    localKey: buildLocalSymbolKey(file.path, "constant", entry.msgid),
    stableKey: buildStableSymbolKey(file.path, "constant", entry.msgid, entry.line),
    displayName: entry.msgid,
    kind: "constant",
    language: file.language!,
    signature: `msgid "${entry.msgid}"`,
    returnType: null,
    doc: entry.extractedComment,
    isExported: isTranslated,
    isDefaultExport: false,
    line: entry.line,
    col: 0,
    endCol: entry.msgid.length,
  });

  for (const ref of entry.references) {
    const colonIdx = ref.lastIndexOf(":");
    const refPath = colonIdx > 0 ? ref.slice(0, colonIdx) : ref;
    const candidates = [refPath, `${refPath}.py`, `${refPath}.js`];
    const resolved = candidates.find((c) => filePathSet.has(c));

    semantics.imports.push({
      localKey: buildImportLocalKey(file.path, "include", refPath, entry.line, 0),
      moduleSpecifier: refPath,
      importKind: "include",
      isTypeOnly: false,
      importedNames: [entry.msgid],
      line: entry.line,
      col: 0,
      endCol: refPath.length,
      resolutionKind: resolved ? "relative_path" : "unresolved",
      targetPathText: resolved ?? refPath,
      targetExternalSymbolKey: null,
    });
  }
}

function makeBlankEntry(): PoEntry {
  return { msgid: "", msgstr: "", references: [], extractedComment: null, line: 0 };
}

function unquotePo(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

export async function parsePoFile(
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  projectImportId: string,
): Promise<ParsedWorkspaceSemantics> {
  const content = file.content ?? "";
  if (!content.trim()) return { ...EMPTY_SEMANTICS };

  const semantics: ParsedWorkspaceSemantics = {
    symbols: [],
    imports: [],
    exports: [],
    relationships: [],
    issues: [],
    externalSymbols: [],
  };

  const lines = content.split(/\r?\n/);
  let entry = makeBlankEntry();
  // "msgid" | "msgstr" | "msgid_plural" | null
  let currentField: "msgid" | "msgstr" | "msgid_plural" | null = null;

  const flush = () => {
    // Skip header entry (msgid "")
    if (entry.msgid) {
      emitEntry(entry, file, filePathSet, semantics, projectImportId);
    }
    entry = makeBlankEntry();
    currentField = null;
  };

  const CHUNK_SIZE = 2000;

  for (let i = 0; i < lines.length; i++) {
    // Yield to event loop every CHUNK_SIZE lines to avoid BullMQ stall detection
    if (i > 0 && i % CHUNK_SIZE === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    const line = lines[i] ?? "";
    const lineNumber = i + 1;

    // Blank line = end of entry
    if (line.trim() === "") {
      flush();
      continue;
    }

    // Extracted comment #.
    if (line.startsWith("#.")) {
      entry.extractedComment = line.slice(2).trim();
      continue;
    }

    // Reference comment #:
    if (line.startsWith("#:")) {
      const refs = line.slice(2).trim().split(/\s+/).filter(Boolean);
      entry.references.push(...refs);
      continue;
    }

    // Other comments — skip
    if (line.startsWith("#")) {
      continue;
    }

    // msgid
    const msgidMatch = line.match(/^msgid\s+"(.*)"$/);
    if (msgidMatch) {
      currentField = "msgid";
      entry.msgid = unquotePo(msgidMatch[1] ?? "");
      entry.line = lineNumber;
      continue;
    }

    // msgid_plural — treat as part of msgid for display
    const msgidPluralMatch = line.match(/^msgid_plural\s+"(.*)"$/);
    if (msgidPluralMatch) {
      currentField = "msgid_plural";
      continue;
    }

    // msgstr or msgstr[n]
    const msgstrMatch = line.match(/^msgstr(?:\[\d+\])?\s+"(.*)"$/);
    if (msgstrMatch) {
      currentField = "msgstr";
      entry.msgstr = unquotePo(msgstrMatch[1] ?? "");
      continue;
    }

    // Multiline continuation "..."
    const continuationMatch = line.match(/^"(.*)"$/);
    if (continuationMatch && currentField) {
      const chunk = unquotePo(continuationMatch[1] ?? "");
      if (currentField === "msgid") entry.msgid += chunk;
      else if (currentField === "msgstr") entry.msgstr += chunk;
      continue;
    }
  }

  // Flush last entry
  flush();

  return semantics;
}
