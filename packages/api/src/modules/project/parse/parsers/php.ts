import type { WorkspaceFileCandidate } from "../file-discovery";
import { buildImportLocalKey, buildLocalSymbolKey, buildStableSymbolKey, createExternalSymbolDraft, maskCommentsAndTemplateLiterals } from "./shared";
import type { ParsedWorkspaceSemantics } from "./types";

export function parsePhpFile(
  file: WorkspaceFileCandidate,
  projectImportId: string,
): ParsedWorkspaceSemantics {
  const semantics: ParsedWorkspaceSemantics = {
    symbols: [],
    imports: [],
    exports: [],
    relationships: [],
    issues: [],
    externalSymbols: [],
  };
  const originalLines = (file.content ?? "").split(/\r?\n/);
  const lines = maskCommentsAndTemplateLiterals(file.content ?? "", { hashLineComments: true }).split(/\r?\n/);

  lines.forEach((line, index) => {
    const originalLine = originalLines[index] ?? line;
    const lineNumber = index + 1;

    const namespaceMatch = line.match(/^\s*namespace\s+([^;]+);/);
    if (namespaceMatch?.[1]) {
      const namespace = namespaceMatch[1].trim();
      const col = line.indexOf(namespace);
      semantics.symbols.push({
        localKey: buildLocalSymbolKey(file.path, "namespace", namespace),
        stableKey: buildStableSymbolKey(file.path, "namespace", namespace, lineNumber),
        displayName: namespace,
        kind: "namespace",
        language: file.language!,
        signature: originalLine.trim(),
        returnType: null,
        doc: null,
        isExported: false,
        isDefaultExport: false,
        line: lineNumber,
        col: Math.max(col, 0),
        endCol: Math.max(col, 0) + namespace.length,
      });
    }

    const useMatch = line.match(/^\s*use\s+([^;]+);/);
    if (useMatch?.[1]) {
      const namespace = useMatch[1].trim();
      const col = line.indexOf(namespace);
      const localKey = buildImportLocalKey(file.path, "use", namespace, lineNumber, col);

      semantics.imports.push({
        localKey,
        moduleSpecifier: namespace,
        importKind: "use",
        isTypeOnly: false,
        importedNames: [],
        line: lineNumber,
        col: Math.max(col, 0),
        endCol: Math.max(col, 0) + namespace.length,
        resolutionKind: "package",
        targetPathText: null,
        targetExternalSymbolKey: `php:${namespace}`,
      });
      semantics.externalSymbols.push(createExternalSymbolDraft(projectImportId, file.language!, namespace));
    }

    const symbolPatterns: Array<{ regex: RegExp; kind: "class" | "interface" | "trait" | "function" }> = [
      { regex: /^\s*class\s+([A-Za-z_]\w*)/, kind: "class" },
      { regex: /^\s*interface\s+([A-Za-z_]\w*)/, kind: "interface" },
      { regex: /^\s*trait\s+([A-Za-z_]\w*)/, kind: "trait" },
      { regex: /^\s*function\s+([A-Za-z_]\w*)/, kind: "function" },
    ];

    for (const pattern of symbolPatterns) {
      const match = line.match(pattern.regex);
      if (!match?.[1]) continue;

      const displayName = match[1];
      const col = line.indexOf(displayName);

      semantics.symbols.push({
        localKey: buildLocalSymbolKey(file.path, pattern.kind, displayName),
        stableKey: buildStableSymbolKey(file.path, pattern.kind, displayName, lineNumber),
        displayName,
        kind: pattern.kind,
        language: file.language!,
        signature: originalLine.trim(),
        returnType: null,
        doc: null,
        isExported: false,
        isDefaultExport: false,
        line: lineNumber,
        col: Math.max(col, 0),
        endCol: Math.max(col, 0) + displayName.length,
      });
      break;
    }
  });

  return semantics;
}
