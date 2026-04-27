import { po } from "gettext-parser";
import type { WorkspaceFileCandidate } from "../file-discovery";
import { buildImportLocalKey, buildLocalSymbolKey, buildStableSymbolKey } from "./shared";
import { EMPTY_SEMANTICS, type ParsedWorkspaceSemantics } from "./types";

export function parsePoFile(
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  projectImportId: string,
): ParsedWorkspaceSemantics {
  const content = file.content ?? "";
  if (!content.trim()) return { ...EMPTY_SEMANTICS };

  let parsed;
  try {
    parsed = po.parse(content);
  } catch {
    return { ...EMPTY_SEMANTICS };
  }

  const semantics: ParsedWorkspaceSemantics = {
    symbols: [],
    imports: [],
    exports: [],
    relationships: [],
    issues: [],
    externalSymbols: [],
  };

  const lines = content.split(/\r?\n/);

  for (const contextGroup of Object.values(parsed.translations)) {
    for (const translation of Object.values(contextGroup)) {
      // gettext-parser includes an empty-string header entry — skip it
      if (translation.msgid === "") continue;

      const msgid = translation.msgid;
      const msgstr = translation.msgstr[0] ?? "";
      const isTranslated = msgstr.trim().length > 0;

      // Find the line number of this msgid in the file
      const msgidLine = lines.findIndex((l) => l.includes(`"${msgid.replace(/"/g, '\\"')}"`) && lines[lines.indexOf(l) - 1]?.startsWith("msgid")) + 1
        || lines.findIndex((l) => l === `msgid "${msgid.replace(/"/g, '\\"')}"`) + 1
        || 1;

      semantics.symbols.push({
        localKey: buildLocalSymbolKey(file.path, "constant", msgid),
        stableKey: buildStableSymbolKey(file.path, "constant", msgid, msgidLine),
        displayName: msgid,
        kind: "constant",
        language: file.language!,
        signature: `msgid "${msgid}"`,
        returnType: null,
        doc: translation.comments?.extracted ?? null,
        isExported: isTranslated,
        isDefaultExport: false,
        line: msgidLine,
        col: 0,
        endCol: msgid.length,
      });

      // Each `#: file:line` reference becomes an import edge back to the source file
      const references = translation.comments?.reference ?? "";
      const refEntries = references.split(/\s+/).filter(Boolean);

      for (const ref of refEntries) {
        const colonIdx = ref.lastIndexOf(":");
        const refPath = colonIdx > 0 ? ref.slice(0, colonIdx) : ref;

        // Normalize path — Frappe refs are usually relative to app root
        const candidates = [
          refPath,
          refPath.endsWith(".py") ? refPath : `${refPath}.py`,
          refPath.endsWith(".js") ? refPath : `${refPath}.js`,
        ];
        const resolved = candidates.find((c) => filePathSet.has(c));

        const localKey = buildImportLocalKey(file.path, "include", refPath, msgidLine, 0);

        semantics.imports.push({
          localKey,
          moduleSpecifier: refPath,
          importKind: "include",
          isTypeOnly: false,
          importedNames: [msgid],
          line: msgidLine,
          col: 0,
          endCol: refPath.length,
          resolutionKind: resolved ? "relative_path" : "unresolved",
          targetPathText: resolved ?? refPath,
          targetExternalSymbolKey: null,
        });
      }
    }
  }

  return semantics;
}
